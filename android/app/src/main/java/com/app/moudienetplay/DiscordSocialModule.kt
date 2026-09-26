package com.app.moudienetplay

import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class DiscordSocialModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val handler = Handler(Looper.getMainLooper())
  private var callbacksRunning = false

  override fun getName(): String = "DiscordSocial"

  @ReactMethod
  fun initialize(applicationId: String) {
    if (applicationId.isBlank() || !DiscordSocialNative.isAvailable()) return
    if (DiscordSocialNative.initialize(applicationId)) startCallbacks()
  }

  @ReactMethod
  fun updateRichPresence(details: String?, state: String?, partyId: String?, partySize: Int, partyMax: Int) {
    if (DiscordSocialNative.isAvailable()) DiscordSocialNative.updateRichPresence(details, state, partyId, partySize, partyMax)
  }

  @ReactMethod
  fun clearRichPresence() {
    if (DiscordSocialNative.isAvailable()) DiscordSocialNative.clearRichPresence()
  }

  private fun startCallbacks() {
    if (callbacksRunning) return
    callbacksRunning = true
    val tick = object : Runnable {
      override fun run() {
        if (!callbacksRunning) return
        DiscordSocialNative.runCallbacks()
        handler.postDelayed(this, 50L)
      }
    }
    handler.post(tick)
  }

  override fun invalidate() {
    callbacksRunning = false
    handler.removeCallbacksAndMessages(null)
    DiscordSocialNative.shutdown()
    super.invalidate()
  }
}

object DiscordSocialNative {
  private var available = false

  init {
    available = try {
      System.loadLibrary("moudie_discord")
      true
    } catch (_: UnsatisfiedLinkError) {
      false
    }
  }

  fun isAvailable(): Boolean = available
  external fun initialize(applicationId: String): Boolean
  external fun updateRichPresence(details: String?, state: String?, partyId: String?, partySize: Int, partyMax: Int)
  external fun clearRichPresence()
  external fun runCallbacks()
  external fun shutdown()
}