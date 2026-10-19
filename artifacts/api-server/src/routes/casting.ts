import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import {
  CreateCastRoomResponse,
  GetCastRoomMessagesParams,
  GetCastRoomMessagesResponse,
  SendCastRoomMessageBody,
  SendCastRoomMessageParams,
  SendCastRoomMessageResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const ROOM_TTL_MS = 10 * 60 * 1000;
const MAX_ACTIVE_ROOMS = 500;
const MAX_MESSAGES_PER_ROOM = 64;
const MAX_SIGNAL_BYTES = 64 * 1024;

type Role = "tv" | "phone";
type SignalType = "offer" | "answer" | "ice" | "ready" | "close";

type Signal = {
  sequence: number;
  from: Role;
  type: SignalType;
  payload: Record<string, unknown>;
};

type Room = {
  id: string;
  expiresAt: number;
  nextSequence: number;
  messages: Signal[];
};

const rooms = new Map<string, Room>();

function clearExpiredRooms(now = Date.now()): void {
  for (const [id, room] of rooms) {
    if (room.expiresAt <= now) {
      rooms.delete(id);
    }
  }
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
  const expiresAt = Date.now() + ROOM_TTL_MS;
  rooms.set(id, { id, expiresAt, nextSequence: 1, messages: [] });

  res.status(201).json(
    CreateCastRoomResponse.parse({
      id,
      expiresAt: new Date(expiresAt).toISOString(),
    }),
  );
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

  res.json(GetCastRoomMessagesResponse.parse(room.messages));
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

  if (Buffer.byteLength(JSON.stringify(parsed.data.payload), "utf8") > MAX_SIGNAL_BYTES) {
    res.status(413).json({ error: "Connection message is too large." });
    return;
  }

  if (room.messages.length >= MAX_MESSAGES_PER_ROOM) {
    res.status(429).json({ error: "This casting room has reached its message limit." });
    return;
  }

  const signal: Signal = {
    sequence: room.nextSequence++,
    from: parsed.data.from as Role,
    type: parsed.data.type as SignalType,
    payload: parsed.data.payload as Record<string, unknown>,
  };
  room.messages.push(signal);

  res.status(201).json(SendCastRoomMessageResponse.parse({ sequence: signal.sequence }));
});

export default router;
