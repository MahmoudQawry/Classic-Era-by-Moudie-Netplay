# Production readiness checklist

## Release gates

1. **Android build:** require the Android workflow to pass TypeScript, tests, native core checks, service health, Gradle release build, APK scans, and Play! bridge checks.
2. **Exact production service:** verify `/api/health` from the origin baked into the APK. The client already probes configured relay URLs before POST mutations.
3. **Room concurrency:** joins are protected by a DB transaction with a row lock; room activation is now a conditional `waiting -> active` transition so duplicate start requests cannot both succeed.
4. **Real devices:** test at least two physical Android devices for every advertised system. Cover Wi-Fi, mobile data, background/foreground, reconnect, jitter/loss, rotation, and process restart.
5. **Voice:** test LiveKit when configured and the built-in WebRTC fallback with TURN on carrier/symmetric-NAT networks. Cloudflare's current room media endpoint is explicitly unconfigured and must not be treated as a production SFU.
6. **Security:** keep Discord/Telegram bot tokens, OAuth secrets, database credentials, TURN credentials, and LiveKit secrets server-side. Never use them in `EXPO_PUBLIC_*` variables.
7. **Dependencies:** run `pnpm audit --prod`, review every high/critical result individually, and upgrade Expo/React-Native dependencies deliberately rather than with a blind audit fix.
8. **Observability:** log room create/join/start, WebSocket disconnects, desync reports, voice failures, and 5xx responses; add alerts before public launch.
9. **Release signing:** keep production Android signing keys in protected CI secrets and separate production signing from test APK publishing.
10. **Rollback:** retain the previous known-good APK and backend deployment identifier so client and server can be rolled back independently.

## Architecture gates

- ROM/BIOS files stay local; the service transports room/session metadata, verified fingerprints, inputs, and small synchronization state.
- Express/MySQL and Cloudflare Durable Objects are separate deployment paths. Select one source of truth per environment; never split a live room between both.
- NetPlay WebSockets remain the gameplay transport. Discord and Telegram are social/community layers, not gameplay transports.

## Acceptance evidence

A public release is verified only after a green Android workflow, a healthy exact production endpoint, and recorded physical-device synchronized-start/reconnect results for each advertised system.
