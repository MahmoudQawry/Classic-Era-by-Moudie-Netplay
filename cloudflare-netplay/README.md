# Cloudflare NetPlay Worker

This directory is the Cloudflare-native room/signaling service for Classic Era.

## Current architecture
- Cloudflare Worker: HTTPS API and WebSocket entry point.
- Durable Object: one persistent SQLite-backed state machine per room.
- Directory Durable Object: join-code and public-room index.
- Standard WebSocket transport: the mobile app keeps its existing NetPlay event API through a small compatibility facade.

## Cloudflare Workers Builds
Build command:
`cd cloudflare-netplay && true`

Deploy command:
`npx wrangler deploy --config cloudflare-netplay/wrangler.jsonc`

After deployment, the health endpoint must return JSON containing `ok: true`.

## Important
The Worker does not contain provider credentials or a fabricated public server URL. The mobile build must receive the real `workers.dev` URL through `EXPO_PUBLIC_NETPLAY_SERVICE_URL` or `EXPO_PUBLIC_API_BASE_URL` before an online APK is considered final.

Voice is intentionally not falsely marked as configured by this first Worker. Cloudflare Realtime can provide managed SFU/TURN, but it requires a separate account-side Realtime configuration and short-lived credentials; that is the next deployment stage.