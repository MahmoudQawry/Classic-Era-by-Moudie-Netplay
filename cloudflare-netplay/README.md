# Cloudflare NetPlay Worker (experimental)

This directory contains an experimental Cloudflare Durable Objects implementation of room/signaling state.

## Production authority

**This worker is not the production room authority for the current repair.** The Android client now uses the main Express + tRPC + MySQL backend for room CRUD and Socket.IO for realtime NetPlay. That prevents two independent systems from owning the same room/session state.

The production topology is:

- **Express + tRPC + MySQL:** accounts, rooms, membership, readiness and persistent room state.
- **Socket.IO:** room presence, chat, game input, synchronization and WebRTC signaling.
- **LiveKit:** group voice media (room channel and player/team channel).
- **Android native emulator:** actual game execution and local save/load state.

Cloudflare remains a candidate for a later realtime migration if load/latency tests justify moving the Socket.IO session plane. If that happens, a session must have exactly one realtime authority; the Express and Cloudflare implementations must not both accept the same session simultaneously.

## Cloudflare-only development

The Worker can still be built/deployed independently for architecture experiments:

`npx wrangler deploy --config cloudflare-netplay/wrangler.jsonc`

It must not be selected by the mobile app merely because a `workers.dev` URL exists.
