#include <jni.h>
#include <dlfcn.h>
#include <android/log.h>

namespace {
using SetJavaVmFn = void (*)(JavaVM*);
using PrepareClassInfoFn = void (*)();

constexpr const char* kSetter =
    "_ZN9Framework7CJavaVM9SetJavaVMEP7_JavaVM";

void* gPlayHandle = nullptr;

void prepareClassInfo(void* handle, const char* symbolName) {
  void* symbol = dlsym(handle, symbolName);
  if (symbol != nullptr) {
    reinterpret_cast<PrepareClassInfoFn>(symbol)();
    __android_log_print(ANDROID_LOG_DEBUG, "MoudiePlayBridge",
        "Prepared Play! JNI class info: %s", symbolName);
  }
}
}

extern "C" JNIEXPORT jboolean JNICALL
Java_expo_modules_moudieemulator_UniversalLibretroPlayerActivity_nativeInitializePlayJavaVm(
    JNIEnv* env,
    jobject /* thiz */,
    jstring core_path) {
  if (core_path == nullptr) return JNI_FALSE;

  const char* path = env->GetStringUTFChars(core_path, nullptr);
  if (path == nullptr) return JNI_FALSE;

  // Kotlin loads the core with System.load() first. Prefer the already-loaded
  // instance so the JavaVM setter modifies the exact libretro core instance
  // that LibretroDroid will subsequently use. If it is not loaded yet, load
  // it here as a fallback.
  if (gPlayHandle == nullptr) {
#ifdef RTLD_NOLOAD
    gPlayHandle = dlopen(path, RTLD_NOLOAD | RTLD_NOW | RTLD_GLOBAL);
#endif
    if (gPlayHandle == nullptr) {
      gPlayHandle = dlopen(path, RTLD_NOW | RTLD_GLOBAL);
    }
  }

  if (gPlayHandle == nullptr) {
    const char* error = dlerror();
    __android_log_print(ANDROID_LOG_ERROR, "MoudiePlayBridge",
        "Could not load Play! core %s: %s", path,
        error ? error : "unknown dlopen error");
    env->ReleaseStringUTFChars(core_path, path);
    return JNI_FALSE;
  }

  void* setter_symbol = dlsym(gPlayHandle, kSetter);
  if (setter_symbol == nullptr) {
    const char* error = dlerror();
    __android_log_print(ANDROID_LOG_ERROR, "MoudiePlayBridge",
        "Could not find Play! JavaVM setter in %s: %s", path,
        error ? error : "unknown symbol error");
    env->ReleaseStringUTFChars(core_path, path);
    return JNI_FALSE;
  }

  JavaVM* vm = nullptr;
  if (env->GetJavaVM(&vm) != JNI_OK || vm == nullptr) {
    __android_log_print(ANDROID_LOG_ERROR, "MoudiePlayBridge",
        "JNIEnv::GetJavaVM failed");
    env->ReleaseStringUTFChars(core_path, path);
    return JNI_FALSE;
  }

  // The Android Play! libretro build does not export JNI_OnLoad. Its regular
  // Android frontend normally calls the following initialization from
  // JNI_OnLoad. We must reproduce the part that remains exported by the
  // libretro core before its CPS2VM thread starts.
  reinterpret_cast<SetJavaVmFn>(setter_symbol)(vm);

  // These are the ClassInfo preparation functions retained/exported by the
  // current arm64 Play! libretro build. Other Play! ClassInfo symbols are
  // stripped from the prebuilt core, so silently skip symbols that are absent.
  constexpr const char* kPrepareSymbols[] = {
      "_ZN7android7content25ContentResolver_ClassInfo16PrepareClassInfoEv",
      "_ZN7android8database16Cursor_ClassInfo16PrepareClassInfoEv",
      "_ZN7android3net13Uri_ClassInfo16PrepareClassInfoEv",
      "_ZN7android2os30ParcelFileDescriptor_ClassInfo16PrepareClassInfoEv",
  };
  for (const char* symbol_name : kPrepareSymbols) {
    prepareClassInfo(gPlayHandle, symbol_name);
  }

  env->ReleaseStringUTFChars(core_path, path);
  __android_log_print(ANDROID_LOG_INFO, "MoudiePlayBridge",
      "Play! JavaVM initialized on the loaded core instance");
  return JNI_TRUE;
}
