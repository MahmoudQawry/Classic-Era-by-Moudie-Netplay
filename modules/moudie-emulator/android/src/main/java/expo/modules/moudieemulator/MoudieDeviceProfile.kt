package expo.modules.moudieemulator

import android.annotation.SuppressLint
import android.app.ActivityManager
import android.content.Context
import android.os.Build
import android.os.PowerManager

/**
 * One place that answers "can this phone actually run this core?".
 *
 * PlayStation 2 (Play!) is the heaviest core in the build: it keeps a dynarec,
 * a recompiled guest image, a geometry/texture cache and an audio ring buffer
 * alive at the same time. On a device with less than 4 GB of RAM the system
 * low-memory killer ends the process while the game is still running, which the
 * player experiences as "it worked, then slowed down, then closed itself".
 *
 * The checks below are deliberately conservative and always report the measured
 * value so the UI can explain a refusal instead of failing silently.
 */
object MoudieDeviceProfile {
  /**
   * The supported minimum for PlayStation 2 emulation inside this app.
   *
   * A marketing "4 GB" phone reports slightly less usable RAM (the kernel and
   * firmware reserve part of it), so the check below accepts a 4 GB-class device
   * from [PS2_CLASS_TOTAL_RAM_FLOOR_BYTES] upwards and only warns inside that
   * band instead of refusing a phone the user legitimately considers a 4 GB
   * device.
   */
  const val PS2_MINIMUM_TOTAL_RAM_BYTES = 4L * 1024L * 1024L * 1024L
  /** A 4 GB-class device reports a little under 4 GB because of reserved RAM. */
  const val PS2_CLASS_TOTAL_RAM_FLOOR_BYTES = 3_400L * 1024L * 1024L
  /** Below this the core cannot be held at all; the session would be killed. */
  const val PS2_HARD_FLOOR_TOTAL_RAM_BYTES = 3L * 1024L * 1024L * 1024L
  /** Below this much *free* RAM a PS2 session is likely to be reclaimed. */
  private const val PS2_MINIMUM_FREE_RAM_BYTES = 900L * 1024L * 1024L
  /** Play! needs the memory-safe heap of a device with a decent heap class. */
  private const val PS2_MINIMUM_MEMORY_CLASS_MB = 192

  data class Snapshot(
    val totalRamBytes: Long,
    val availableRamBytes: Long,
    val lowRamDevice: Boolean,
    val memoryClassMb: Int,
    val largeMemoryClassMb: Int,
    val cpuCores: Int,
    val glEsVersion: Int,
    val largeHeap: Boolean,
    val thermalMonitoringAvailable: Boolean,
  ) {
    val totalRamGb: Double get() = totalRamBytes.toDouble() / (1024.0 * 1024.0 * 1024.0)
    val glesLabel: String get() = "${(glEsVersion shr 16)}.${(glEsVersion and 0xffff)}"
  }

  fun snapshot(context: Context): Snapshot {
    val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
    val memoryInfo = ActivityManager.MemoryInfo()
    activityManager?.getMemoryInfo(memoryInfo)
    val configurationInfo = activityManager?.deviceConfigurationInfo
    return Snapshot(
      totalRamBytes = memoryInfo.totalMem,
      availableRamBytes = memoryInfo.availMem,
      lowRamDevice = activityManager?.isLowRamDevice ?: false,
      memoryClassMb = activityManager?.memoryClass ?: 0,
      largeMemoryClassMb = activityManager?.largeMemoryClass ?: 0,
      cpuCores = Runtime.getRuntime().availableProcessors(),
      glEsVersion = configurationInfo?.reqGlEsVersion ?: 0,
      largeHeap = (context.applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_LARGE_HEAP) != 0,
      thermalMonitoringAvailable = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q,
    )
  }

  /**
   * Returns a readable reason when PlayStation 2 cannot be started safely, or
   * null when the device is inside the supported envelope.
   */
  fun ps2BlockingReason(context: Context): String? {
    val snapshot = snapshot(context)
    if (!supportsOpenGlEs32(snapshot)) {
      return "PlayStation 2 requires OpenGL ES 3.2 or higher. This device reports OpenGL ES ${snapshot.glesLabel}, so the game was blocked instead of crashing the app."
    }
    if (snapshot.totalRamBytes < PS2_HARD_FLOOR_TOTAL_RAM_BYTES) {
      return "PlayStation 2 needs a device with at least 4 GB of RAM. This device reports %.1f GB, which is far below the supported minimum, so the system would end the session as soon as the game loads.".format(snapshot.totalRamGb)
    }
    if (snapshot.lowRamDevice) {
      return "This device is reported as a low-RAM device by Android, so PlayStation 2 emulation cannot be run reliably here."
    }
    if (snapshot.memoryClassMb in 1 until PS2_MINIMUM_MEMORY_CLASS_MB && snapshot.largeMemoryClassMb < PS2_MINIMUM_MEMORY_CLASS_MB) {
      return "The system heap on this device (${snapshot.memoryClassMb} MB) is too small for the PlayStation 2 core. Close other apps and try again, or use a device with more memory."
    }
    return null
  }

  /**
   * A non-blocking caution for a 4 GB-class device (usable RAM just under 4 GB)
   * or for a device whose free memory is already thin. Returning null means the
   * device is comfortably inside the supported envelope.
   */
  fun ps2WarningReason(context: Context): String? {
    val snapshot = snapshot(context)
    if (snapshot.totalRamBytes < PS2_MINIMUM_TOTAL_RAM_BYTES) {
      return "This device reports %.1f GB of usable RAM (4 GB devices reserve part of it). PlayStation 2 can run here, but the app will watch memory and save your progress if Android needs the memory back.".format(snapshot.totalRamGb)
    }
    return null
  }

  /** True when the free memory is low enough that a PS2 session is at risk. */
  fun ps2MemoryPressure(context: Context, minimumFreeBytes: Long = PS2_MINIMUM_FREE_RAM_BYTES): Boolean {
    val snapshot = snapshot(context)
    return snapshot.lowRamDevice || snapshot.availableRamBytes < minimumFreeBytes
  }

  fun supportsOpenGlEs32(context: Context): Boolean = supportsOpenGlEs32(snapshot(context))

  private fun supportsOpenGlEs32(snapshot: Snapshot): Boolean = snapshot.glEsVersion >= 0x00030002

  /**
   * Current thermal throttling level, or -1 when the platform cannot report it.
   * THERMAL_STATUS_MODERATE and above is where Android has usually already
   * reduced the CPU/GPU clock, which is the "it worked, then it got slow" part
   * of a long PlayStation 2 session.
   */
  @SuppressLint("NewApi")
  fun thermalStatus(context: Context): Int {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return -1
    val powerManager = context.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return -1
    return runCatching { powerManager.currentThermalStatus }.getOrDefault(-1)
  }

  fun thermalLabel(status: Int): String = when (status) {
    PowerManager.THERMAL_STATUS_NONE -> "normal"
    PowerManager.THERMAL_STATUS_LIGHT -> "light"
    PowerManager.THERMAL_STATUS_MODERATE -> "moderate"
    PowerManager.THERMAL_STATUS_SEVERE -> "severe"
    PowerManager.THERMAL_STATUS_CRITICAL -> "critical"
    PowerManager.THERMAL_STATUS_EMERGENCY -> "emergency"
    PowerManager.THERMAL_STATUS_SHUTDOWN -> "shutdown"
    else -> "unknown"
  }

  /** Compact line the room screen can display before a PS2 session starts. */
  fun describe(context: Context): Map<String, Any> {
    val snapshot = snapshot(context)
    val blocking = ps2BlockingReason(context)
    val warning = if (blocking == null) ps2WarningReason(context) else null
    return mapOf(
      "totalRamGb" to "%.1f".format(snapshot.totalRamGb).toDouble(),
      "availableRamMb" to (snapshot.availableRamBytes / (1024L * 1024L)).toInt(),
      "cpuCores" to snapshot.cpuCores,
      "glEsVersion" to snapshot.glesLabel,
      "largeHeap" to snapshot.largeHeap,
      "lowRamDevice" to snapshot.lowRamDevice,
      "ps2Supported" to (blocking == null),
      "ps2Warning" to warning,
      "ps2Message" to (blocking ?: warning ?: "This device meets the PlayStation 2 requirements."),
    )
  }
}
