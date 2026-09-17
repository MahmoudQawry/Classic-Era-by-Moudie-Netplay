#!/usr/bin/env bash
set -euo pipefail

# Android arm64 Libretro cores are fetched from the official Libretro buildbot
# during CI. Executable cores are never downloaded by the app at runtime.
ABI="${1:-arm64-v8a}"
TARGET="modules/moudie-emulator/android/src/main/jniLibs/${ABI}"
ASSETS_TARGET="modules/moudie-emulator/android/src/main/assets/ppsspp"
BASE_URL="https://buildbot.libretro.com/nightly/android/latest/${ABI}"
SYSTEM_URL="https://buildbot.libretro.com/assets/system/PPSSPP.zip"

if [[ "${ABI}" != "arm64-v8a" ]]; then
  echo "This project currently bundles verified prebuilt cores for arm64-v8a only." >&2
  exit 2
fi

mkdir -p "${TARGET}" "${ASSETS_TARGET}"
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TEMP_DIR}"' EXIT

fetch_core() {
  local remote_name="$1"
  local local_name="$2"
  local archive="${TEMP_DIR}/${local_name}.zip"
  echo "Downloading ${remote_name}…"
  curl --fail --location --retry 3 --retry-delay 2 -o "${archive}" "${BASE_URL}/${remote_name}_libretro_android.so.zip"
  unzip -p "${archive}" "${remote_name}_libretro_android.so" > "${TARGET}/${local_name}_libretro_android.so"
  test -s "${TARGET}/${local_name}_libretro_android.so"
}

fetch_ppsspp_assets() {
  local archive="${TEMP_DIR}/PPSSPP.zip"
  echo "Downloading official PPSSPP system assets…"
  curl --fail --location --retry 3 --retry-delay 2 -o "${archive}" "${SYSTEM_URL}"
  rm -rf "${ASSETS_TARGET}"; mkdir -p "${ASSETS_TARGET}"
  unzip -q "${archive}" -d "${ASSETS_TARGET}"
  if [[ -d "${ASSETS_TARGET}/PPSSPP" ]]; then
    shopt -s dotglob; mv "${ASSETS_TARGET}/PPSSPP"/* "${ASSETS_TARGET}/"; rmdir "${ASSETS_TARGET}/PPSSPP"; shopt -u dotglob
  fi
  test -f "${ASSETS_TARGET}/ppge_atlas.zim" || { echo "PPSSPP assets are incomplete." >&2; exit 3; }
}

fetch_core fceumm fceumm
fetch_core pcsx_rearmed pcsx_rearmed
fetch_core genesis_plus_gx genesis_plus_gx
fetch_core ppsspp ppsspp
fetch_core mupen64plus_next mupen64plus_next
# Play! is the lighter PS2 Libretro option selected for a simple Android runtime.
fetch_core play play
fetch_ppsspp_assets

echo "Installed Libretro cores: NES, PS1, PSP, Sega, N64, PS2 (Play!)."