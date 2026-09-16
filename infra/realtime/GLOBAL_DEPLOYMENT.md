# Moudie NetPlay — Global Realtime Deployment

## Target architecture

```text
Mobile / Windows / macOS / Web
            |
            v
   realtime.moudie.net
            |
     Geo/Latency LB
      /     |      \
     v      v       v
  ME-UAE   EU-DE   US-East (+ APAC as traffic grows)
     |      |       |
     +------+-------+
            |
      Socket.IO relay
            |
   shared persistent state
            |
        MySQL + Redis

Voice / realtime media:
            |
       LiveKit Cloud
   (global edge + nearest region)
```

## Why this design

The NetPlay emulator channel is stateful: a room must stay on one authoritative relay for its active session. Do **not** randomly move individual sockets of the same room between regions. The client therefore supports a regional relay pool and deterministic room affinity.

The public hostname should eventually be `realtime.moudie.net`. Keep that hostname stable even when a region is added, removed, or migrated. The application should never need a new APK merely because the relay moved.

## Regional relay placement

Start with:

- `me-central`: UAE / Middle East
- `eu-west`: Germany / Central Europe
- `us-east`: US East

Add India/Singapore and US West when real traffic shows demand there.

Each relay should be a persistent compute instance, not a sleeping/autoscaling web container. The relay needs long-lived WebSockets and predictable CPU/network performance.

## Global load balancer

Put a WebSocket-capable latency/geo load balancer in front of the regional relay endpoints.

Recommended behavior:

1. Health-check `GET /api/realtime/health`.
2. Prefer the lowest-latency healthy region.
3. Keep session affinity for an active room.
4. Fail new rooms to another healthy region when the preferred region is down.
5. Do not migrate an active emulator room mid-session unless state handoff has been explicitly implemented and tested.

Cloudflare Load Balancing is one supported implementation. Its traffic steering can use health, geographic location, and RTT-based dynamic steering, and its load balancers support WebSockets.

Example origin hostnames:

- `relay-me.moudie.net`
- `relay-eu.moudie.net`
- `relay-us.moudie.net`

The public application hostname remains `realtime.moudie.net`.

## LiveKit voice

For the voice room, prefer LiveKit Cloud for the production global deployment. It provides a globally distributed media mesh and routes users to the closest edge, avoiding the current single-region voice bottleneck.

If self-hosting LiveKit later, use the region-aware node selector, a shared Redis message bus, and latency/geo-aware signal load balancing. LiveKit supports this multi-region model directly.

## Environment variables

### Relay server

```text
REALTIME_REGION=me-central
REALTIME_RELEASE=2026.09.x
REALTIME_MIGRATION_TARGET=
DATABASE_URL=...
REDIS_ADDRESS=...
REDIS_PASSWORD=...
```

`/api/realtime/health` exposes only non-secret region/release metadata for load-balancer health checks.

### Android / Expo build

For multiple regional origins, provide:

```text
EXPO_PUBLIC_NETPLAY_SERVICE_URL=https://realtime.moudie.net
EXPO_PUBLIC_NETPLAY_SERVICE_URLS=https://relay-me.moudie.net,https://relay-eu.moudie.net,https://relay-us.moudie.net
```

The app pins the same room to one relay deterministically so the authoritative emulator state remains together. When the public hostname is backed by a global load balancer, the single primary URL is preferred.

## Migration rule

A relay migration is safe only for rooms that have not started emulation. During a rolling deployment:

1. Mark the old region draining at the load balancer.
2. Stop admitting new rooms there.
3. Let active rooms finish.
4. Keep health checks green only while the region can accept existing sessions.
5. Shift new rooms to the new region.
6. Deploy the new release.

LiveKit itself supports connection draining for active rooms; use the same operational principle for the Socket.IO relay.

## Capacity and monitoring

Monitor at minimum:

- p50/p95/p99 RTT
- packet loss
- Socket.IO reconnect rate
- voice reconnect rate
- active rooms
- active sockets
- CPU and memory
- outbound bandwidth
- WebRTC UDP/TCP/TURN usage
- snapshot memory budget
- room start failures

A region should be considered unhealthy for NetPlay when latency or reconnect rate crosses the production SLO, even if HTTP health checks still return 200.

## Important limitation

Repository changes can make the application and deployment architecture ready for global relays, but they cannot create cloud servers, DNS records, or a LiveKit Cloud project without access to the corresponding infrastructure account. The current APK therefore remains compatible with the existing relay until the production DNS/origin endpoints are provisioned.
