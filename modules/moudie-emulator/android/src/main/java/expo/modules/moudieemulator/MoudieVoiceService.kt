package expo.modules.moudieemulator

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioManager
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.NoiseSuppressor
import android.os.Build
import android.os.IBinder
import android.os.Process
import android.util.Log
import androidx.core.app.NotificationCompat
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Production-grade Squad Voice Engine Foreground Service.
 *
 * Runs with FOREGROUND_SERVICE_TYPE_MICROPHONE and FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
 * at THREAD_PRIORITY_URGENT_AUDIO.
 * Decouples signaling and heartbeats from React Native JS thread starvation during
 * Libretro 60 FPS emulation to eliminate the ~60s LiveKit cutoff.
 */
class MoudieVoiceService : Service() {

  companion object {
    private const val TAG = "MoudieVoiceService"
    const val ACTION_START = "expo.modules.moudieemulator.VOICE_START"
    const val ACTION_STOP = "expo.modules.moudieemulator.VOICE_STOP"
    const val ACTION_MUTE_MIC = "expo.modules.moudieemulator.MUTE_MIC"
    const val ACTION_UNMUTE_MIC = "expo.modules.moudieemulator.UNMUTE_MIC"
    const val ACTION_SET_SPEAKER = "expo.modules.moudieemulator.SET_SPEAKER"

    const val EXTRA_ROOM_ID = "roomId"
    const val EXTRA_MEMBER_ID = "memberId"
    const val EXTRA_SERVER_URL = "serverUrl"
    const val EXTRA_TOKEN = "token"
    const val EXTRA_SPEAKER_ON = "speakerOn"

    private const val CHANNEL_ID = "moudie_squad_voice_channel"
    private const val CHANNEL_NAME = "Classic Era Squad Voice"
    private const val NOTIFICATION_ID = 88421

    val isServiceRunning = AtomicBoolean(false)

    fun start(context: Context, roomId: Int, memberId: Int, serverUrl: String?, token: String?) {
      val intent = Intent(context, MoudieVoiceService::class.java).apply {
        action = ACTION_START
        putExtra(EXTRA_ROOM_ID, roomId)
        putExtra(EXTRA_MEMBER_ID, memberId)
        putExtra(EXTRA_SERVER_URL, serverUrl.orEmpty())
        putExtra(EXTRA_TOKEN, token.orEmpty())
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    fun stop(context: Context) {
      val intent = Intent(context, MoudieVoiceService::class.java).apply {
        action = ACTION_STOP
      }
      context.startService(intent)
    }

    fun setSpeaker(context: Context, enabled: Boolean) {
      val intent = Intent(context, MoudieVoiceService::class.java).apply {
        action = ACTION_SET_SPEAKER
        putExtra(EXTRA_SPEAKER_ON, enabled)
      }
      context.startService(intent)
    }
  }

  private var audioManager: AudioManager? = null
  private var keepaliveThread: Thread? = null
  private val active = AtomicBoolean(false)
  private var activeRoomId: Int = 0
  private var activeMemberId: Int = 0
  private var activeServerUrl: String = ""
  private var activeToken: String = ""

  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
    setupAudioEnvironment()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val action = intent?.action ?: ACTION_START
    when (action) {
      ACTION_START -> {
        activeRoomId = intent?.getIntExtra(EXTRA_ROOM_ID, 0) ?: 0
        activeMemberId = intent?.getIntExtra(EXTRA_MEMBER_ID, 0) ?: 0
        activeServerUrl = intent?.getStringExtra(EXTRA_SERVER_URL).orEmpty()
        activeToken = intent?.getStringExtra(EXTRA_TOKEN).orEmpty()
        startVoiceForeground()
        startPriorityKeepalive()
      }
      ACTION_STOP -> {
        stopVoiceForeground()
      }
      ACTION_MUTE_MIC -> {
        audioManager?.isMicrophoneMute = true
      }
      ACTION_UNMUTE_MIC -> {
        audioManager?.isMicrophoneMute = false
      }
      ACTION_SET_SPEAKER -> {
        val speaker = intent?.getBooleanExtra(EXTRA_SPEAKER_ON, true) ?: true
        audioManager?.isSpeakerphoneOn = speaker
      }
    }
    return START_STICKY
  }

  private fun setupAudioEnvironment() {
    try {
      val am = getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
      audioManager = am
      // Set mode to MODE_IN_COMMUNICATION for VoIP echo cancellation & hardware noise suppression
      am.mode = AudioManager.MODE_IN_COMMUNICATION
      am.isSpeakerphoneOn = true

      // Verify Hardware AEC & NS availability
      val aecAvailable = AcousticEchoCanceler.isAvailable()
      val nsAvailable = NoiseSuppressor.isAvailable()
      Log.i(TAG, "Audio hardware filters: AEC=$aecAvailable, NS=$nsAvailable")
    } catch (e: Throwable) {
      Log.w(TAG, "Could not initialize hardware audio filters: ${e.message}")
    }
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        CHANNEL_NAME,
        NotificationManager.IMPORTANCE_LOW
      ).apply {
        description = "Indestructible squad voice audio channel"
        setShowBadge(false)
        setSound(null, null)
      }
      val nm = getSystemService(NotificationManager::class.java)
      nm?.createNotificationChannel(channel)
    }
  }

  private fun startVoiceForeground() {
    val iconRes = applicationInfo.icon.takeIf { it != 0 } ?: android.R.drawable.ic_btn_speak_now
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
    val pendingIntent = if (launchIntent != null) {
      PendingIntent.getActivity(
        this,
        0,
        launchIntent,
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
      )
    } else null

    val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("Classic Era Squad Voice Active")
      .setContentText("Continuous high-priority audio pipeline running")
      .setSmallIcon(iconRes)
      .setOngoing(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setContentIntent(pendingIntent)
      .build()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val serviceTypes = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
      startForeground(NOTIFICATION_ID, notification, serviceTypes)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
    active.set(true)
    isServiceRunning.set(true)
    Log.i(TAG, "MoudieVoiceService entered foreground")
  }

  private fun startPriorityKeepalive() {
    keepaliveThread?.interrupt()
    keepaliveThread = Thread {
      // Set urgent audio thread priority to never be starved by 60fps rendering
      Process.setThreadPriority(Process.THREAD_PRIORITY_URGENT_AUDIO)
      Log.i(TAG, "Voice keepalive thread started with THREAD_PRIORITY_URGENT_AUDIO")

      while (active.get()) {
        try {
          sendNativeHeartbeat()
          Thread.sleep(2500)
        } catch (_: InterruptedException) {
          break
        } catch (e: Throwable) {
          Log.d(TAG, "Keepalive tick: ${e.message}")
        }
      }
    }.apply {
      name = "MoudieVoiceUrgentKeepalive"
      isDaemon = true
      start()
    }
  }

  private fun sendNativeHeartbeat() {
    if (activeServerUrl.isBlank() || activeRoomId <= 0 || activeMemberId <= 0) return
    val baseUrl = activeServerUrl.trimEnd('/')
    try {
      val pingUrl = URL("$baseUrl/api/netplay/ping?roomId=$activeRoomId&memberId=$activeMemberId")
      val connection = (pingUrl.openConnection() as? HttpURLConnection) ?: return
      connection.requestMethod = "GET"
      connection.connectTimeout = 2000
      connection.readTimeout = 2000
      connection.useCaches = false
      if (activeToken.isNotBlank()) {
        connection.setRequestProperty("Authorization", "Bearer $activeToken")
      }
      val code = connection.responseCode
      connection.disconnect()
      Log.d(TAG, "Native voice heartbeat ping: HTTP $code")
    } catch (_: Throwable) {
      // Best effort keepalive
    }
  }

  private fun stopVoiceForeground() {
    active.set(false)
    isServiceRunning.set(false)
    keepaliveThread?.interrupt()
    keepaliveThread = null
    try {
      audioManager?.mode = AudioManager.MODE_NORMAL
    } catch (_: Throwable) {}
    stopForeground(true)
    stopSelf()
    Log.i(TAG, "MoudieVoiceService stopped")
  }

  override fun onDestroy() {
    stopVoiceForeground()
    super.onDestroy()
  }
}
