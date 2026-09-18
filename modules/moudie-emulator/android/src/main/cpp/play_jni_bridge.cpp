#include <jni.h>
#include <dlfcn.h>
#include <android/log.h>

namespace {
using SetJavaVmFn = void (*)(JavaVM*);

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

  reinterpret_cast<SetJavaVmFn>(setter_symbol)(vm);
  env->ReleaseStringUTFChars(core_path, path);
  __android_log_print(ANDROID_LOG_INFO, "MoudiePlayBridge", "Play! JavaVM initialized");
  return JNI_TRUE;
}
