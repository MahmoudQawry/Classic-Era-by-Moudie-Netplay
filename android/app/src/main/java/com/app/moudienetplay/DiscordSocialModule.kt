package com.app.moudienetplay

import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class DiscordSocialModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  private var nativeAvailable = false
  private val callbackHandler = Handler(Looper.getMainLooper())
  private val callbackPump = object : Runnable {
    override fun run() {
      if (nativeAvailable) {
        nativeRunCallbacks()
        callbackHandler.postDelayed(this, 50L)
      }
    }
  }

  init {
    nativeAvailable = try {
      System.loadLibrary("classicera_discord")
      true
    } catch (_: UnsatisfiedLinkError) {
      false
    }
  }

  override fun getName(): String = "DiscordSocial"

  @ReactMethod
  fun initialize(applicationId: String) {
    val id = applicationId.toLongOrNull() ?: return
    if (!nativeAvailable || !nativeInitialize(id)) return
    callbackHandler.removeCallbacks(callbackPump)
    callbackHandler.post(callbackPump)
  }

  @ReactMethod
  fun updateRichPresence(
    details: String?,
    state: String?,
    partyId: String?,
    partySize: Int,
    partyMax: Int,
  ) {
    if (!nativeAvailable) return
    nativeUpdateRichPresence(details, state, partyId, partySize, partyMax)
  }

  @ReactMethod
  fun clearRichPresence() {
    if (!nativeAvailable) return
    nativeClearRichPresence()
  }

  override fun invalidate() {
    callbackHandler.removeCallbacks(callbackPump)
    if (nativeAvailable) nativeClearRichPresence()
    super.invalidate()
  }

  private external fun nativeInitialize(applicationId: Long): Boolean
  private external fun nativeRunCallbacks()
  private external fun nativeUpdateRichPresence(
    details: String?,
    state: String?,
    partyId: String?,
    partySize: Int,
    partyMax: Int,
  )
  private external fun nativeClearRichPresence()
}
