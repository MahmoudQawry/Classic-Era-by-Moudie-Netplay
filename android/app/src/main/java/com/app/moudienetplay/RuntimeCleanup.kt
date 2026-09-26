package com.app.moudienetplay

import android.content.Context
import java.io.File

/**
 * Safe runtime cleanup registry.
 * Never removes ROMs, BIOS files, save states, or controller layouts.
 */
object RuntimeCleanup {
  private const val MAX_SMALL_CACHE_BYTES = 8L * 1024L * 1024L

  fun run(context: Context) {
    cleanDirectory(context.cacheDir)
    cleanDirectory(File(context.filesDir, "moudie-tmp"))
    cleanDirectory(File(context.cacheDir, "moudie-tmp"))
  }

  private fun cleanDirectory(dir: File) {
    if (!dir.exists()) return
    dir.listFiles().orEmpty().forEach { file ->
      if (file.isDirectory) {
        cleanDirectory(file)
        if (file.listFiles().isNullOrEmpty()) file.delete()
      } else if (file.length() <= MAX_SMALL_CACHE_BYTES) {
        file.delete()
      }
    }
  }
}
