package com.app.moudienetplay

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.ComponentCallbacks2
import android.content.res.Configuration
import android.os.Build
import android.util.Log
import java.io.File
import java.io.FileOutputStream

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint
import com.facebook.react.defaults.DefaultReactNativeHost

import com.livekit.reactnative.LiveKitReactNative
import com.livekit.reactnative.audio.AudioType

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ReactNativeHostWrapper

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost = ReactNativeHostWrapper(
      this,
      object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> =
            PackageList(this).packages.apply {
              add(DiscordSocialPackage())
            }

          override fun getJSMainModuleName(): String = ".expo/.virtual-metro-entry"

          override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

          override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
      }
  )

  override val reactHost: ReactHost
    get() = ReactNativeHostWrapper.createReactHost(applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel("classic-era-background", "Classic Era background play", NotificationManager.IMPORTANCE_LOW).apply {
        description = "Background emulator and room status"
        setShowBadge(false)
      }
      getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
    val priorUncaughtHandler = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, error ->
      Log.e("MoudieStartup", "Uncaught failure on ${thread.name}", error)
      // Record the failure in the same bounded diagnostics file the emulator
      // writes, so an app that "closed itself" during a heavy session (for
      // example PlayStation 2) leaves a readable reason on the device.
      runCatching {
        val target = File(filesDir, "moudie-session.log")
        if (target.isFile && target.length() > 192L * 1024L) {
          target.writeText(target.readLines().takeLast(200).joinToString("\n", postfix = "\n"))
        }
        FileOutputStream(target, true).use { output ->
          val head = error.stackTrace.take(4).joinToString(" | ") { "${it.className}.${it.methodName}:${it.lineNumber}" }
          output.write("${java.util.Date()} CRASH thread=${thread.name} type=${error.javaClass.name} $head\n".toByteArray())
          output.fd.sync()
        }
      }
      priorUncaughtHandler?.uncaughtException(thread, error)
    }
    DefaultNewArchitectureEntryPoint.releaseLevel = try {
      ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
    } catch (e: IllegalArgumentException) {
      ReleaseLevel.STABLE
    }
    LiveKitReactNative.setup(this, AudioType.CommunicationAudioType())
    RuntimeCleanup.run(this)
    loadReactNative(this)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  override fun onTrimMemory(level: Int) {
    super.onTrimMemory(level)
    if (level >= ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW) {
      // Discard only small temporary cache files; ROMs, saves, and user files are preserved.
      RuntimeCleanup.run(this)
    }
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
