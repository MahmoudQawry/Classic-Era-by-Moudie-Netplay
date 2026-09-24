#define DISCORDPP_IMPLEMENTATION
#include <discordpp.h>

#include <jni.h>
#include <android/log.h>
#include <mutex>
#include <string>

namespace {
std::mutex g_mutex;
std::unique_ptr<discordpp::Client> g_client;

void logError(const char* message) {
  __android_log_print(ANDROID_LOG_ERROR, "ClassicEraDiscord", "%s", message);
}
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_app_moudienetplay_DiscordSocialModule_nativeInitialize(
    JNIEnv* env,
    jobject /* thiz */,
    jlong applicationId) {
  if (applicationId <= 0) {
    return JNI_FALSE;
  }

  std::lock_guard<std::mutex> lock(g_mutex);
  try {
    if (!g_client) {
      g_client = std::make_unique<discordpp::Client>();
      g_client->SetApplicationId(static_cast<uint64_t>(applicationId));
    }
    return JNI_TRUE;
  } catch (...) {
    g_client.reset();
    logError("Discord Social SDK initialization failed.");
    return JNI_FALSE;
  }
}

extern "C" JNIEXPORT void JNICALL
Java_com_app_moudienetplay_DiscordSocialModule_nativeRunCallbacks(
    JNIEnv* /* env */,
    jobject /* thiz */) {
  try {
    discordpp::RunCallbacks();
  } catch (...) {
    logError("Discord Social SDK callback processing failed.");
  }
}

extern "C" JNIEXPORT void JNICALL
Java_com_app_moudienetplay_DiscordSocialModule_nativeUpdateRichPresence(
    JNIEnv* env,
    jobject /* thiz */,
    jstring details,
    jstring state,
    jstring partyId,
    jint partySize,
    jint partyMax) {
  std::lock_guard<std::mutex> lock(g_mutex);
  if (!g_client) {
    return;
  }

  const char* detailsChars = details ? env->GetStringUTFChars(details, nullptr) : nullptr;
  const char* stateChars = state ? env->GetStringUTFChars(state, nullptr) : nullptr;
  const char* partyChars = partyId ? env->GetStringUTFChars(partyId, nullptr) : nullptr;

  try {
    discordpp::Activity activity{};
    activity.SetType(discordpp::ActivityTypes::Playing);

    if (detailsChars && *detailsChars) {
      activity.SetDetails(std::string(detailsChars));
    }
    if (stateChars && *stateChars) {
      activity.SetState(std::string(stateChars));
    }

    activity.SetSupportedPlatforms(discordpp::ActivityGamePlatforms::Android);

    if (partyChars && *partyChars && partySize > 0 && partyMax >= partySize) {
      discordpp::ActivityParty party{};
      party.SetId(std::string(partyChars));
      party.SetCurrentSize(partySize);
      party.SetMaxSize(partyMax);
      activity.SetParty(party);
    }

    g_client->UpdateRichPresence(std::move(activity), [](discordpp::ClientResult result) {
      if (!result.Successful()) {
        __android_log_print(
            ANDROID_LOG_WARN,
            "ClassicEraDiscord",
            "Rich Presence update failed: %s",
            result.ToString().c_str());
      }
    });
  } catch (...) {
    logError("Discord Rich Presence update failed.");
  }

  if (detailsChars) env->ReleaseStringUTFChars(details, detailsChars);
  if (stateChars) env->ReleaseStringUTFChars(state, stateChars);
  if (partyChars) env->ReleaseStringUTFChars(partyId, partyChars);
}

extern "C" JNIEXPORT void JNICALL
Java_com_app_moudienetplay_DiscordSocialModule_nativeClearRichPresence(
    JNIEnv* /* env */,
    jobject /* thiz */) {
  std::lock_guard<std::mutex> lock(g_mutex);
  if (g_client) {
    try {
      g_client->ClearRichPresence();
    } catch (...) {
      logError("Discord Rich Presence clear failed.");
    }
  }
}
