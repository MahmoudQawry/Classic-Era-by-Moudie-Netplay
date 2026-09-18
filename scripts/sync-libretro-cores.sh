#!/usr/bin/env bash
set -euo pipefail
ABI="${1:-arm64-v8a}"
TARGET="modules/moudie-emulator/android/src/main/jniLibs/${ABI}"
ASSETS_TARGET="modules/moudie-emulator/android/src/main/assets/ppsspp"
BASE_URL="https://buildbot.libretro.com/nightly/android/latest/${ABI}"
SYSTEM_URL="https://buildbot.libretro.com/assets/system/PPSSPP.zip"
if [[ "${ABI}" != "arm64-v8a" ]]; then echo "This project currently bundles verified prebuilt cores for arm64-v8a only." >&2; exit 2; fi
mkdir -p "${TARGET}" "${ASSETS_TARGET}"
TEMP_DIR="$(mktemp -d)"; trap 'rm -rf "${TEMP_DIR}"' EXIT
fetch_core() { local remote_name="$1"; local local_name="$2"; local archive="${TEMP_DIR}/${local_name}.zip"; echo "Downloading ${remote_name}…"; curl --fail --location --retry 3 --retry-delay 2 -o "${archive}" "${BASE_URL}/${remote_name}_libretro_android.so.zip"; unzip -p "${archive}" "${remote_name}_libretro_android.so" > "${TARGET}/${local_name}_libretro_android.so"; test -s "${TARGET}/${local_name}_libretro_android.so"; }
fetch_ppsspp_assets() { local archive="${TEMP_DIR}/PPSSPP.zip"; echo "Downloading official PPSSPP system assets…"; curl --fail --location --retry 3 --retry-delay 2 -o "${archive}" "${SYSTEM_URL}"; rm -rf "${ASSETS_TARGET}"; mkdir -p "${ASSETS_TARGET}"; unzip -q "${archive}" -d "${ASSETS_TARGET}"; if [[ -d "${ASSETS_TARGET}/PPSSPP" ]]; then shopt -s dotglob; mv "${ASSETS_TARGET}/PPSSPP"/* "${ASSETS_TARGET}/"; rmdir "${ASSETS_TARGET}/PPSSPP"; shopt -u dotglob; fi; test -f "${ASSETS_TARGET}/ppge_atlas.zim" || { echo "PPSSPP assets are incomplete." >&2; exit 3; }; }
build_play_core() {
  local play_source="${TEMP_DIR}/Play-"
  local play_build="${TEMP_DIR}/play-build"
  local ndk="${ANDROID_NDK_HOME:-${ANDROID_NDK:-}}"
  if [[ -z "${ndk}" || ! -f "${ndk}/build/cmake/android.toolchain.cmake" ]]; then
    echo "Android NDK with CMake toolchain is required to build the patched Play! core." >&2
    exit 4
  fi

  echo "Building patched Play! core from upstream source..."
  git clone --depth 1 --recurse-submodules --shallow-submodules https://github.com/jpd002/Play-.git "${play_source}"

  python3 - "${play_source}/Source/ui_libretro/main_libretro.cpp" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
text = path.read_text()
include = "#ifdef __ANDROID__\n#include <jni.h>\n#include <dlfcn.h>\n#include \"android/JavaVM.h\"\n#endif\n"
anchor = "#include \"PH_Libretro_Input.h\"\n"
if include not in text:
    if anchor not in text: raise SystemExit("Could not locate Play! libretro include anchor")
    text = text.replace(anchor, anchor + "\n" + include, 1)
anchor = "void retro_init()\n{\n"
bootstrap = """void retro_init()
{
#ifdef __ANDROID__
\tJavaVM* javaVm = nullptr;
\tjsize javaVmCount = 0;
\tusing GetCreatedJavaVMsFn = jint (*)(JavaVM**, jsize, jsize*);
\tauto getCreatedJavaVMs = reinterpret_cast<GetCreatedJavaVMsFn>(dlsym(RTLD_DEFAULT, "JNI_GetCreatedJavaVMs"));
\tvoid* jniProvider = nullptr;
\tif(getCreatedJavaVMs == nullptr)
\t{
\t\tjniProvider = dlopen("libnativehelper.so", RTLD_NOW | RTLD_LOCAL);
\t\tif(jniProvider != nullptr)
\t\t\tgetCreatedJavaVMs = reinterpret_cast<GetCreatedJavaVMsFn>(dlsym(jniProvider, "JNI_GetCreatedJavaVMs"));
\t}
\tif(getCreatedJavaVMs != nullptr && getCreatedJavaVMs(&javaVm, 1, &javaVmCount) == JNI_OK && javaVm != nullptr && javaVmCount > 0)
\t{
\t\t// LibretroDroid uses dlopen(), so Android does not invoke Play! JNI_OnLoad automatically.
\t\t// Initialize CJavaVM inside THIS Play! library instance.
\t\tFramework::CJavaVM::SetJavaVM(javaVm);
\t\tCLog::GetInstance().Print(LOG_NAME, "%s\\n", "Moudie PS2 JNI bootstrap: JavaVM initialized");
\t}
\telse
\t{
\t\tCLog::GetInstance().Print(LOG_NAME, "%s\\n", "Moudie PS2 JNI bootstrap FAILED: JavaVM unavailable");
\t}
#endif
"""
if "Moudie PS2 JNI bootstrap" not in text:
    if anchor not in text: raise SystemExit("Could not locate Play! retro_init")
    text = text.replace(anchor, bootstrap, 1)
path.write_text(text)
PY

  cmake -S "${play_source}" -B "${play_build}" -G Ninja \
    -DBUILD_LIBRETRO_CORE=yes \
    -DBUILD_PLAY=off \
    -DBUILD_TESTS=no \
    -DENABLE_AMAZON_S3=no \
    -DANDROID_ABI="${ABI}" \
    -DANDROID_NATIVE_API_LEVEL=24 \
    -DANDROID_NDK="${ndk}" \
    -DCMAKE_TOOLCHAIN_FILE="${ndk}/build/cmake/android.toolchain.cmake" \
    -DCMAKE_BUILD_TYPE=Release
  cmake --build "${play_build}" --target play_libretro --parallel 2

  local built
  built="$(find "${play_build}" -type f -name 'play_libretro_android.so' -print -quit)"
  test -n "${built}" && test -s "${built}"
  cp "${built}" "${TARGET}/play_libretro_android.so"
  strings "${TARGET}/play_libretro_android.so" | grep -q "Moudie PS2 JNI bootstrap"
  echo "Installed patched Play! core: ${TARGET}/play_libretro_android.so"
}

fetch_core fceumm fceumm
fetch_core pcsx_rearmed pcsx_rearmed
fetch_core genesis_plus_gx genesis_plus_gx
fetch_core ppsspp ppsspp
# Parallel-N64 is the verified Android arm64 N64 core available on the Libretro buildbot.
fetch_core parallel_n64 parallel_n64
# Play! is built from upstream source with a libretro-specific Android JavaVM bootstrap.
build_play_core
fetch_ppsspp_assets
echo "Installed Libretro cores: NES, PS1, PSP, Sega, N64 (Parallel-N64), PS2 (Play!)."
