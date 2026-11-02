import { randomUUID } from "node:crypto";
import { allocatePairingCode } from "../lib/pairing-code";
import { Router, type IRouter } from "express";
import {
  CreateCastRoomResponse,
  GetCastRoomMessagesParams,
  GetCastRoomMessagesResponse,
  LookupCastRoomByCodeBody,
  LookupCastRoomByCodeResponse,
  SendCastRoomMessageBody,
  SendCastRoomMessageParams,
  SendCastRoomMessageResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const ROOM_IDLE_TTL_MS = 4 * 60 * 60 * 1000;
const EXPIRY_DISPLAY_BUCKET_MS = 60 * 1000;
const MAX_ACTIVE_ROOMS = 500;
const MAX_MESSAGES_PER_ROOM = 512;
const MAX_SIGNAL_BYTES = 64 * 1024;
const MAX_SIGNAL_HISTORY_BYTES = 512 * 1024;

type Role = "tv" | "phone";
type SignalType = "offer" | "answer" | "ice" | "ready" | "close" | "local-video" | "player-command" | "player-state";

type Signal = {
  sequence: number;
  from: Role;
  type: SignalType;
  payload: Record<string, unknown>;
};

type Room = {
  id: string;
  code: string;
  expiresAt: number;
  nextSequence: number;
  messages: Signal[];
  signalBytes: number;
};

const rooms = new Map<string, Room>();
const roomIdsByCode = new Map<string, string>();
const lookupAttempts = new Map<string, { count: number; resetAt: number }>();

function clearExpiredRooms(now = Date.now()): void {
  for (const [id, room] of rooms) {
    if (room.expiresAt <= now) {
      rooms.delete(id);
      roomIdsByCode.delete(room.code);
    }
  }
  for (const [ip, attempt] of lookupAttempts) {
    if (attempt.resetAt <= now) {
      lookupAttempts.delete(ip);
    }
  }
}

function refreshRoomExpiry(room: Room, now = Date.now()): string {
  room.expiresAt = now + ROOM_IDLE_TTL_MS;
  const displayExpiry = Math.ceil(room.expiresAt / EXPIRY_DISPLAY_BUCKET_MS) * EXPIRY_DISPLAY_BUCKET_MS;
  return new Date(displayExpiry).toISOString();
}

function createUniqueCode(): string {
  return allocatePairingCode(roomIdsByCode);
}

function allowCodeLookup(ip: string, now = Date.now()): boolean {
  const current = lookupAttempts.get(ip);
  if (!current || current.resetAt <= now) {
    lookupAttempts.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (current.count >= 10) {
    return false;
  }
  current.count += 1;
  return true;
}

const expirySweep = setInterval(() => clearExpiredRooms(), 60_000);
expirySweep.unref();

router.post("/cast/rooms", (_req, res): void => {
  clearExpiredRooms();
  if (rooms.size >= MAX_ACTIVE_ROOMS) {
    res.status(503).json({ error: "Casting is busy. Please try again shortly." });
    return;
  }

  const id = randomUUID();
  const code = createUniqueCode();
  const expiresAt = Date.now() + ROOM_IDLE_TTL_MS;
  rooms.set(id, { id, code, expiresAt, nextSequence: 1, messages: [], signalBytes: 0 });
  roomIdsByCode.set(code, id);

  res.status(201).json(
    CreateCastRoomResponse.parse({
      id,
      code,
      expiresAt: new Date(expiresAt).toISOString(),
    }),
  );
});

router.post("/cast/rooms/lookup", (req, res): void => {
  clearExpiredRooms();
  const parsed = LookupCastRoomByCodeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter the two- or three-digit code shown on the TV." });
    return;
  }

  if (!allowCodeLookup(req.ip ?? req.socket.remoteAddress ?? "unknown")) {
    res.status(429).json({ error: "Too many attempts. Wait a minute and try again." });
    return;
  }

  const roomId = roomIdsByCode.get(parsed.data.code);
  const room = roomId ? rooms.get(roomId) : undefined;
  if (!room) {
    res.status(404).json({ error: "That code is invalid or has expired." });
    return;
  }

  refreshRoomExpiry(room);
  res.json(LookupCastRoomByCodeResponse.parse({ roomId }));
});

router.get("/cast/rooms/:roomId/messages", (req, res): void => {
  clearExpiredRooms();
  const params = GetCastRoomMessagesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid room identifier." });
    return;
  }

  const room = rooms.get(params.data.roomId);
  if (!room) {
    res.status(404).json({ error: "This casting room has expired." });
    return;
  }

  const expiresAt = refreshRoomExpiry(room);
  res.json(GetCastRoomMessagesResponse.parse({ messages: room.messages, expiresAt }));
});

router.post("/cast/rooms/:roomId/messages", (req, res): void => {
  clearExpiredRooms();
  const params = SendCastRoomMessageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid room identifier." });
    return;
  }

  const room = rooms.get(params.data.roomId);
  if (!room) {
    res.status(404).json({ error: "This casting room has expired." });
    return;
  }

  const parsed = SendCastRoomMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid connection message." });
    return;
  }

  const signalBytes = Buffer.byteLength(JSON.stringify(parsed.data.payload), "utf8");
  if (signalBytes > MAX_SIGNAL_BYTES) {
    res.status(413).json({ error: "Connection message is too large." });
    return;
  }

  // Playback telemetry is a snapshot, not an ever-growing history. A four-hour
  // film must not exhaust the signaling room after a few minutes.
  if (parsed.data.type === "player-state") {
    room.messages = room.messages.filter((message) =>
      !(message.type === "player-state" && message.from === parsed.data.from));
  }
  if (parsed.data.type === "player-command") {
    const commands = room.messages.filter((message) => message.type === "player-command");
    const cutoff = commands.length >= 32 ? commands[commands.length - 32].sequence : 0;
    room.messages = room.messages.filter((message) => message.type !== "player-command" || message.sequence > cutoff);
  }
  room.signalBytes = room.messages.reduce((bytes, message) => bytes + Buffer.byteLength(JSON.stringify(message.payload), "utf8"), 0);
  if (room.messages.length >= MAX_MESSAGES_PER_ROOM || room.signalBytes + signalBytes > MAX_SIGNAL_HISTORY_BYTES) {
    res.status(429).json({ error: "This room has reached its connection-message limit. Create a fresh room to continue." });
    return;
  }

  const signal: Signal = {
    sequence: room.nextSequence++,
    from: parsed.data.from as Role,
    type: parsed.data.type as SignalType,
    payload: parsed.data.payload as Record<string, unknown>,
  };
  room.messages.push(signal);
  room.signalBytes += signalBytes;
  refreshRoomExpiry(room);

  res.status(201).json(SendCastRoomMessageResponse.parse({ sequence: signal.sequence }));
});

export default router;
