#!/usr/bin/env bash
set -euo pipefail

SDK="${1:-android/app/libs/discord_partner_sdk.aar}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ ! -f "$ROOT/$SDK" ]]; then
  echo "Missing official Discord Social SDK AAR: $ROOT/$SDK" >&2
  exit 2
fi

WORK="$ROOT/android/app/.discord-sdk"
rm -rf "$WORK"
mkdir -p "$WORK" "$ROOT/android/app/libs" "$ROOT/android/app/src/main/cpp/discord" "$ROOT/android/app/src/main/jniLibs/arm64-v8a"

unzip -q "$ROOT/$SDK" -d "$WORK"
cp "$WORK/libs/discord_partner_sdk.jar" "$ROOT/android/app/libs/discord_partner_sdk.jar"
cp "$WORK/libs/libwebrtc.jar" "$ROOT/android/app/libs/libwebrtc.jar"
cp "$WORK/jni/arm64-v8a/libdiscord_partner_sdk.so" "$ROOT/android/app/src/main/jniLibs/arm64-v8a/libdiscord_partner_sdk.so"
cp "$WORK/prefab/modules/discord_partner_sdk/include/discordpp.h" "$ROOT/android/app/src/main/cpp/discord/discordpp.h"
cp "$WORK/prefab/modules/discord_partner_sdk/include/cdiscord.h" "$ROOT/android/app/src/main/cpp/discord/cdiscord.h"
rm -rf "$WORK"

echo "Official Discord Social SDK imported successfully."
