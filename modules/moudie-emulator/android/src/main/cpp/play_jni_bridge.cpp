#include <jni.h>
#include <dlfcn.h>
#include <android/log.h>

namespace {
using SetJavaVmFn = void (*)(JavaVM*);
using PrepareClassInfoFn = void (*)();

constexpr const char* kSetter =
    "_ZN9Framework7CJavaVM9SetJavaVMEP7_JavaVM";

void* gPlayHandle = nullptr;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_expo_modules_moudieemulator_UniversalLibretroPlayerActivity_nativeInitializePlayJavaVm(
    JNIEnv* env,
    jobject /* thiz */,
    jstring core_path) {
  if (core_path == nullptr) return JNI_FALSE;

  const char* path = env->GetStringUTFChars(core_path, nullptr);
  if (path == nullptr) return JNI_FALSE;

  if (gPlayHandle == nullptr) {
    gPlayHandle = dlopen(path, RTLD_NOW | RTLD_LOCAL);
  }

  void* setter_symbol = gPlayHandle == nullptr ? nullptr : dlsym(gPlayHandle, kSetter);
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
    __android_log_print(ANDROID_LOG_ERROR, "MoudiePlayBridge", "JNIEnv::GetJavaVM failed");
    env->ReleaseStringUTFChars(core_path, path);
    return JNI_FALSE;
  }

  // The Play! libretro build used here does not export JNI_OnLoad, so the
  // JavaVM setter alone is insufficient. Upstream Play! initializes its
  // Android JNI ClassInfo singletons from JNI_OnLoad. Reproduce the
  // available initialization hooks before LibretroDroid starts the core.
  reinterpret_cast<SetJavaVmFn>(setter_symbol)(vm);

  constexpr const char* kPrepareSymbols[] = {
      "_ZN7android7content25ContentResolver_ClassInfo16PrepareClassInfoEv",
      "_ZN7android8database16Cursor_ClassInfo16PrepareClassInfoEv",
      "_ZN7android3net13Uri_ClassInfo16PrepareClassInfoEv",
      "_ZN7android2os30ParcelFileDescriptor_ClassInfo16PrepareClassInfoEv",
  };
  for (const char* symbol_name : kPrepareSymbols) {
    void* symbol = dlsym(gPlayHandle, symbol_name);
    if (symbol != nullptr) {
      reinterpret_cast<PrepareClassInfoFn>(symbol)();
    }
  }

  env->ReleaseStringUTFChars(core_path, path);
  __android_log_print(ANDROID_LOG_INFO, "MoudiePlayBridge", "Play! JavaVM and Android JNI bridge initialized");
  return JNI_TRUE;
}
