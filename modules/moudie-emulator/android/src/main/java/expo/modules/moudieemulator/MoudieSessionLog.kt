package expo.modules.moudieemulator

import android.content.Context
import android.os.Build
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * A bounded, on-device record of what an emulator session actually did.
 *
 * A PlayStation 2 session that "slows down and then closes itself" is almost
 * never one error: it is a long thermal ramp followed by the low-memory killer
 * ending the process, which leaves nothing behind to inspect. This log keeps the
 * last measured frames-per-second, free RAM and thermal level, plus the exit
 * reason, in a single capped file that never contains game data.
 *
 * The file is a diagnostic aid only: it is safe to delete, it is capped at
 * [MAX_LOG_BYTES], and no ROM, BIOS, save state or user file is ever read.
 */
object MoudieSessionLog {
  private const val LOG_FILE = "moudie-session.log"
  private const val MARKER_FILE = "moudie-session-active"
  private const val MAX_LOG_BYTES = 192L * 1024L
  private const val SAMPLE_INTERVAL_MS = 10_000L
  private const val MAX_REPORT_LINES = 24

  private val timestampFormat = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US)
  private var lastSampleAt = 0L

  private fun logFile(context: Context) = File(context.filesDir, LOG_FILE)
  private fun markerFile(context: Context) = File(context.filesDir, MARKER_FILE)

  @Synchronized
  fun startSession(context: Context, system: String, gameName: String, details: String) {
    lastSampleAt = 0L
    val previous = readMarker(context)
    if (previous != null) {
      append(context, "PREVIOUS SESSION DID NOT CLOSE CLEANLY: $previous")
    }
    val header = buildString {
      append("SESSION START system=$system game=${gameName.take(80)} ")
      append("android=${Build.VERSION.RELEASE}(api ${Build.VERSION.SDK_INT}) ")
      append("$details")
    }
    append(context, header)
    writeMarker(context, "system=$system started=${timestampFormat.format(Date())}")
  }

  @Synchronized
  fun sample(context: Context, fps: Long, system: String) {
    val now = System.currentTimeMillis()
    if (now - lastSampleAt < SAMPLE_INTERVAL_MS) return
    lastSampleAt = now
    val profile = runCatching { MoudieDeviceProfile.snapshot(context) }.getOrNull()
    val thermal = MoudieDeviceProfile.thermalStatus(context)
    val memoryMb = (profile?.availableRamBytes ?: -1L) / (1024L * 1024L)
    append(
      context,
      "SAMPLE system=$system fps=$fps freeRamMb=$memoryMb thermal=${MoudieDeviceProfile.thermalLabel(thermal)}",
    )
  }

  @Synchronized
  fun note(context: Context, message: String) = append(context, "NOTE $message")

  @Synchronized
  fun endSession(context: Context, reason: String) {
    markerFile(context).delete()
    append(context, "SESSION END reason=$reason")
  }

  /** True when the app is running after an unclean shutdown of a session. */
  fun previousSessionUnclean(context: Context): Boolean = readMarker(context) != null

  /** Tail of the log for display, newest line last. Never throws. */
  fun report(context: Context): List<String> = runCatching {
    val file = logFile(context)
    if (!file.isFile) return@runCatching emptyList<String>()
    file.readLines().takeLast(MAX_REPORT_LINES)
  }.getOrDefault(emptyList())

  @Synchronized
  private fun append(context: Context, line: String) {
    runCatching {
      val file = logFile(context)
      if (file.isFile && file.length() > MAX_LOG_BYTES) {
        val kept = file.readLines().takeLast(200)
        file.writeText(kept.joinToString("\n", postfix = "\n"))
      }
      FileOutputStream(file, true).use { output ->
        output.write("${timestampFormat.format(Date())} $line\n".toByteArray())
        output.fd.sync()
      }
    }
  }

  private fun writeMarker(context: Context, content: String) {
    runCatching { markerFile(context).writeText(content) }
  }

  private fun readMarker(context: Context): String? = runCatching {
    val file = markerFile(context)
    if (file.isFile && file.length() > 0L) file.readText().trim().ifBlank { null } else null
  }.getOrNull()
}
