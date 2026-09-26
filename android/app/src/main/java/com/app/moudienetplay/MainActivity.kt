package com.app.moudienetplay

import android.os.Bundle
import android.util.Log

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import expo.modules.ReactActivityDelegateWrapper

/**
 * Deliberately stays close to Expo's generated activity. Startup UI must be
 * rendered by the regular React root; no native overlay or pre-draw gate is
 * allowed to sit above it.
 */
class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    try {
      runCatching {
        val sdkClass = Class.forName("com.discord.socialsdk.DiscordSocialSdkInit")
        sdkClass.getMethod("setEngineActivity", android.app.Activity::class.java).invoke(null, this)
      }.onFailure { error ->
        Log.i("MoudieDiscord", "Discord Social SDK binary not bundled; native bridge will remain inactive", error)
      }
      super.onCreate(null)
    } catch (error: Throwable) {
      Log.e("MoudieStartup", "ReactActivity could not be created", error)
      throw error
    }
  }

  override fun getMainComponentName(): String = "main"

  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
      this,
      BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
      object : DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled) {},
    )
  }

  override fun invokeDefaultOnBackPressed() {
    if (android.os.Build.VERSION.SDK_INT <= android.os.Build.VERSION_CODES.R) {
      if (!moveTaskToBack(false)) super.invokeDefaultOnBackPressed()
      return
    }
    super.invokeDefaultOnBackPressed()
  }
}
