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

  // IMPORTANT: do not use System.load() for Play! from Kotlin. LibretroDroid
  // subsequently opens the core with dlopen(). Android can place those loads
  // in different linker namespaces, which can create two copies of Play!'s
  // static Framework::CJavaVM::m_vm. The bridge therefore owns the FIRST
  // dlopen() of the core, initializes that exact handle, and LibretroDroid's
  // later dlopen() reuses the already-loaded object.
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
  // Reproduce the complete Android JNI_OnLoad initialization used by the
  // official Play! frontend. The libretro build does not receive JNI_OnLoad
  // from Android's loader, so initializing only the JavaVM is insufficient:
  // later PS2 startup code can access any of these generated ClassInfo objects.
  constexpr const char* kPrepareSymbols[] = {
      "_ZN4java3net13URL_ClassInfo16PrepareClassInfoEv",
      "_ZN4java3net27HttpURLConnection_ClassInfo16PrepareClassInfoEv",
      "_ZN4java4io21InputStream_ClassInfo16PrepareClassInfoEv",
      "_ZN4java4io22OutputStream_ClassInfo16PrepareClassInfoEv",
      "_ZN4java8security23MessageDigest_ClassInfo16PrepareClassInfoEv",
      "_ZN5javax6crypto13Mac_ClassInfo16PrepareClassInfoEv",
      "_ZN5javax6crypto4spec23SecretKeySpec_ClassInfo16PrepareClassInfoEv",
      "_ZN7android7content25ContentResolver_ClassInfo16PrepareClassInfoEv",
      "_ZN7android8database16Cursor_ClassInfo16PrepareClassInfoEv",
      "_ZN7android3net13Uri_ClassInfo16PrepareClassInfoEv",
      "_ZN7android2os30ParcelFileDescriptor_ClassInfo16PrepareClassInfoEv",
      "_ZN3com19virtualapplications4play18Bootable_ClassInfo16PrepareClassInfoEv",
  };
  for (const char* symbol_name : kPrepareSymbols) {
    prepareClassInfo(gPlayHandle, symbol_name);
  }

  env->ReleaseStringUTFChars(core_path, path);
  __android_log_print(ANDROID_LOG_INFO, "MoudiePlayBridge",
      "Play! JavaVM initialized on the loaded core instance");
  return JNI_TRUE;
}
