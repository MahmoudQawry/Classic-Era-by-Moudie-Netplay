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
  if [[ -z "${ndk}" || ! -f "${ndk}/build/cmake/android.toolchain.cmake" ]]; then echo "Android NDK with CMake toolchain is required to build the patched Play! core." >&2; exit 4; fi
  echo "Building patched Play! core from upstream source..."
  git clone --depth 1 --recurse-submodules --shallow-submodules https://github.com/jpd002/Play-.git "${play_source}"

  python3 - "${play_source}/Source/ui_libretro/GSH_OpenGL_Libretro.cpp" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
text = path.read_text()
text = text.replace(
"""	if(g_hw_render.get_current_framebuffer)
		m_presentFramebuffer = g_hw_render.get_current_framebuffer();
""",
"""	// Moudie frontend: Play!'s GS runs on the libretro/GL thread and presents
	// directly into the GLSurfaceView default framebuffer. LibretroDroid's
	// intermediate FBO is not used for this core because Play! owns the
	// presentation pass and asynchronous GS state can otherwise leave the
	// hand-off texture black even while the emulator/audio/input are alive.
	m_presentFramebuffer = 0;
""",1)
text = text.replace(
"""	if(g_hw_render.get_current_framebuffer)
		m_presentFramebuffer = g_hw_render.get_current_framebuffer();
	else
		return;

	CGSH_OpenGL::FlipImpl(dispInfo);
""",
"""	// Keep presentation on the Android window framebuffer for this frontend.
	m_presentFramebuffer = 0;
	CGSH_OpenGL::FlipImpl(dispInfo);
""",1)
text = text.replace(
"""	if(g_video_cb)
		g_video_cb(RETRO_HW_FRAME_BUFFER_VALID, GetCrtWidth() * g_res_factor, GetCrtHeight() * g_res_factor, 0);
""",
"""	// The framebuffer is already the Android GLSurfaceView default framebuffer.
	// Do not invoke LibretroDroid's hardware-video callback here: that callback
	// would run its own post-processing renderer and clear the framebuffer we
	// just presented.
""",1)
if "Moudie frontend: Play!'s GS runs on the libretro/GL thread" not in text: raise SystemExit("Direct presentation patch was not applied")
path.write_text(text)
PY

  python3 - "${play_source}/Source/ui_libretro/main_libretro.cpp" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
text = path.read_text()
include = """#ifdef __ANDROID__
#include <jni.h>
#include <dlfcn.h>
#include "android/JavaVM.h"
#endif
"""
anchor = '#include "PH_Libretro_Input.h"
'
if include not in text:
    if anchor not in text: raise SystemExit("Could not locate Play! libretro include anchor")
    text = text.replace(anchor, anchor + "
" + include, 1)
anchor = "void retro_init()
{
"
bootstrap = """void retro_init()
{
#ifdef __ANDROID__
	JavaVM* javaVm = nullptr;
	jsize javaVmCount = 0;
	using GetCreatedJavaVMsFn = jint (*)(JavaVM**, jsize, jsize*);
	auto getCreatedJavaVMs = reinterpret_cast<GetCreatedJavaVMsFn>(dlsym(RTLD_DEFAULT, "JNI_GetCreatedJavaVMs"));
	void* jniProvider = nullptr;
	if(getCreatedJavaVMs == nullptr)
	{
		jniProvider = dlopen("libnativehelper.so", RTLD_NOW | RTLD_LOCAL);
		if(jniProvider != nullptr)
			getCreatedJavaVMs = reinterpret_cast<GetCreatedJavaVMsFn>(dlsym(jniProvider, "JNI_GetCreatedJavaVMs"));
	}
	if(getCreatedJavaVMs != nullptr && getCreatedJavaVMs(&javaVm, 1, &javaVmCount) == JNI_OK && javaVm != nullptr && javaVmCount > 0)
	{
		Framework::CJavaVM::SetJavaVM(javaVm);
		CLog::GetInstance().Print(LOG_NAME, "%s\n", "Moudie PS2 JNI bootstrap: JavaVM initialized");
	}
	else
	{
		CLog::GetInstance().Print(LOG_NAME, "%s\n", "Moudie PS2 JNI bootstrap FAILED: JavaVM unavailable");
	}
#endif
"""
if "Moudie PS2 JNI bootstrap" not in text:
    if anchor not in text: raise SystemExit("Could not locate Play! retro_init")
    text = text.replace(anchor, bootstrap, 1)
path.write_text(text)
PY

  cmake -S "${play_source}" -B "${play_build}" -G Ninja -DBUILD_LIBRETRO_CORE=yes -DBUILD_PLAY=off -DBUILD_TESTS=no -DENABLE_AMAZON_S3=no -DGLES_COMPATIBILITY=1 -DANDROID_STL=c++_static -DANDROID_ABI="${ABI}" -DANDROID_NATIVE_API_LEVEL=24 -DANDROID_NDK="${ndk}" -DCMAKE_TOOLCHAIN_FILE="${ndk}/build/cmake/android.toolchain.cmake" -DCMAKE_BUILD_TYPE=Release
  cmake --build "${play_build}" --target play_libretro --parallel 2
  local built
  built="$(find "${play_build}" -type f -name 'play_libretro_android.so' -print -quit)"
  test -n "${built}" && test -s "${built}"
  cp "${built}" "${TARGET}/play_libretro_android.so"
  echo "Installed patched Play! core: ${TARGET}/play_libretro_android.so"
}
fetch_core fceumm fceumm
fetch_core pcsx_rearmed pcsx_rearmed
fetch_core genesis_plus_gx genesis_plus_gx
fetch_core ppsspp ppsspp
fetch_core parallel_n64 parallel_n64
build_play_core
fetch_ppsspp_assets
echo "Installed Libretro cores: NES, PS1, PSP, Sega, N64 (Parallel-N64), PS2 (Play!)."
