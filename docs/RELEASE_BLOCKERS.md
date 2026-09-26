# Release blockers — 1.0.0

## Blocking external inputs

1. **Discord Social SDK Android package**
   - The official Discord documentation requires the Android discord_partner_sdk.aar, C++ headers, and native bridge setup.
   - The repository currently contains the Expo/config bridge and Android auth manifest prerequisites, but the official SDK binary itself is not present in the repository or Library.
   - Do not replace this with a third-party mirror for production.
   - Required input: the SDK archive downloaded from the Discord Developer Portal for the Moudie application.

2. **Branded boot video**
   - The requested new boot video is not present in the repository.
   - The application now accepts EXPO_PUBLIC_BOOT_VIDEO_URL; when it is unset, the checked-in MN processor artwork is used as a safe startup fallback.
   - This prevents a missing binary from breaking the release build.

3. **Production LiveKit credentials/certificates**
   - The repository now has the production LiveKit SFU + embedded TURN configuration.
   - Deployment still requires real LIVEKIT_API_KEY, LIVEKIT_API_SECRET, REDIS_PASSWORD, TURN_DOMAIN, and TLS certificate/key values in the deployment environment.
   - These values must never be committed or embedded in the APK.

## Verified in repository/CI

- Application version is unified to 1.0.0 / versionCode 1.
- Six emulator systems are represented in the native catalog and CI matrix.
- Play! framebuffer override that could black-screen PS2 has been removed; upstream presentation path is restored.
- Android ABI configuration targets armeabi-v7a, arm64-v8a, x86, and x86_64.
- LiveKit is the production voice transport; the old WebRTC mesh path is no longer the documented production route.
- Release builds require dedicated signing credentials; CI uses an ephemeral key only for test artifacts.
- Safe repository/runtime cleanup is registered without deleting ROMs, BIOS, saves, or controller layouts.
- The zero-byte unused brand poster was removed.