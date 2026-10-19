# FrameCast

FrameCast lets someone pair a smart-TV browser with a phone and stream a selected video or photo directly between them.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/framecast run dev` — run the TV/phone web app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- FrameCast casting rooms: in-memory only; no database connection is used
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/framecast` — React/Vite TV and phone web experience.
- `artifacts/api-server` — short-lived casting-room signaling API.
- `lib/api-spec/openapi.yaml` — source of truth for signaling API contracts.

## Architecture decisions

- Video and photo files remain on the phone and are sent to the TV over a direct WebRTC connection; the API does not receive media bytes.
- Pairing and WebRTC negotiation messages live only in API-server memory and expire after a short window. Do not add persistent storage for media or signaling.
- No STUN/TURN relay is enabled in the initial version; require both devices to use the same Wi-Fi, and explain that some networks may still block direct connections.

## Product

- The TV opens the app in its browser and displays a QR code and five-digit pairing code.
- A phone can scan the QR code or enter the five-digit code, then select a local photo or video and stream it directly to the TV.
- The app must explain when direct casting is unsupported or blocked instead of silently uploading or relaying the video.

## User preferences

- Privacy requirement: do not save or upload users' video or persistent personal data.

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
