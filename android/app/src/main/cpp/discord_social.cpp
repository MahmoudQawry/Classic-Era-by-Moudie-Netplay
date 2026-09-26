#define DISCORDPP_IMPLEMENTATION
#include "discordpp.h"

#include <jni.h>
#include <android/log.h>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <tuple>
#include <utility>

namespace {
std::mutex g_mutex;
std::unique_ptr<discordpp::Client> g_client;
std::optional<std::tuple<std::string, std::string, std::string, int32_t, int32_t>> g_pending;

void publishLocked() {
#if defined(__aarch64__)
  if (!g_client || g_client->GetStatus() != discordpp::Client::Status::Ready || !g_pending.has_value()) return;
  auto [details, state, partyId, partySize, partyMax] = *g_pending;
  discordpp::Activity activity{};
  activity.SetSupportedPlatforms(discordpp::ActivityGamePlatforms::Android);
  if (!details.empty()) activity.SetDetails(details);
  if (!state.empty()) activity.SetState(state);
  if (!partyId.empty()) {
    discordpp::ActivityParty party{};
    party.SetId(partyId);
    party.SetCurrentSize(partySize < 1 ? 1 : partySize);
    party.SetMaxSize(partyMax < 0 ? 0 : partyMax);
    party.SetPrivacy(discordpp::ActivityPartyPrivacy::Public);
    activity.SetParty(std::move(party));
  }
  g_client->UpdateRichPresence(std::move(activity), [](discordpp::ClientResult result) {
    if (!result.Successful()) __android_log_print(ANDROID_LOG_WARN, "MoudieDiscord", "Rich Presence update failed");
  });
#endif
}
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_app_moudienetplay_DiscordSocialNative_initialize(JNIEnv* env, jobject, jstring applicationId) {
#if !defined(__aarch64__)
  return JNI_FALSE;
#else
  const char* chars = env->GetStringUTFChars(applicationId, nullptr);
  if (!chars) return JNI_FALSE;
  uint64_t appId = 0;
  try { appId = std::stoull(chars); }
  catch (...) { env->ReleaseStringUTFChars(applicationId, chars); return JNI_FALSE; }
  env->ReleaseStringUTFChars(applicationId, chars);

  std::lock_guard<std::mutex> lock(g_mutex);
  if (!g_client) {
    g_client = std::make_unique<discordpp::Client>();
    g_client->SetStatusChangedCallback([](auto status, auto error, auto details) {
      __android_log_print(ANDROID_LOG_INFO, "MoudieDiscord", "status=%s error=%d details=%d",
        discordpp::Client::StatusToString(status).c_str(), static_cast<int>(error), details);
      std::lock_guard<std::mutex> callbackLock(g_mutex);
      publishLocked();
    });
  }
  g_client->SetApplicationId(appId);
  g_client->Connect();
  return JNI_TRUE;
#endif
}

extern "C" JNIEXPORT void JNICALL
Java_com_app_moudienetplay_DiscordSocialNative_updateRichPresence(
    JNIEnv* env, jobject, jstring details, jstring state, jstring partyId, jint partySize, jint partyMax) {
#if defined(__aarch64__)
  auto readString = [env](jstring value) -> std::string {
    if (!value) return {};
    const char* chars = env->GetStringUTFChars(value, nullptr);
    if (!chars) return {};
    std::string out(chars);
    env->ReleaseStringUTFChars(value, chars);
    return out;
  };
  std::lock_guard<std::mutex> lock(g_mutex);
  g_pending = std::make_tuple(readString(details), readString(state), readString(partyId), static_cast<int32_t>(partySize), static_cast<int32_t>(partyMax));
  publishLocked();
#endif
}

extern "C" JNIEXPORT void JNICALL
Java_com_app_moudienetplay_DiscordSocialNative_clearRichPresence(JNIEnv*, jobject) {
#if defined(__aarch64__)
  std::lock_guard<std::mutex> lock(g_mutex);
  g_pending.reset();
  if (g_client && g_client->GetStatus() == discordpp::Client::Status::Ready) g_client->ClearRichPresence();
#endif
}

extern "C" JNIEXPORT void JNICALL
Java_com_app_moudienetplay_DiscordSocialNative_runCallbacks(JNIEnv*, jobject) {
#if defined(__aarch64__)
  discordpp::RunCallbacks();
#endif
}

extern "C" JNIEXPORT void JNICALL
Java_com_app_moudienetplay_DiscordSocialNative_shutdown(JNIEnv*, jobject) {
#if defined(__aarch64__)
  std::lock_guard<std::mutex> lock(g_mutex);
  if (g_client) g_client->Disconnect();
  g_client.reset();
  g_pending.reset();
#endif
}