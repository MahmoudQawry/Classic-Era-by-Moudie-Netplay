package com.app.moudienetplay

import android.content.Context
import java.io.File

/**
 * Safe runtime cleanup registry for the React Native side of the app.
 *
 * Never removes ROMs, BIOS files, save states, or controller layouts.
 *
 * The emulator's own caches (`cache/moudie-*-games`, `files/moudie-*/states`) are
 * owned by the native emulator module: it knows which copy is currently playing
 * and prunes by budget there. This class therefore leaves those directories
 * alone instead of deleting a game image out from under a running session.
 */
object RuntimeCleanup {
  /** Files larger than this are never deleted by a generic cache pass. */
  private const val MAX_SMALL_CACHE_BYTES = 8L * 1024L * 1024L
  /** Generic cache budget; the rest of the cache is patient and re-creatable. */
  private const val CACHE_BUDGET_BYTES = 256L * 1024L * 1024L
  private const val MINIMUM_AGE_MS = 10L * 60L * 1000L

  private val emulatorOwnedPrefixes = listOf("moudie-")

  fun run(context: Context) {
    cleanDirectory(context.cacheDir, topLevel = true)
    cleanDirectory(File(context.filesDir, "moudie-tmp"), topLevel = true)
    enforceBudget(context.cacheDir, CACHE_BUDGET_BYTES)
  }

  private fun isEmulatorOwned(directory: File): Boolean =
    directory.isDirectory && emulatorOwnedPrefixes.any { directory.name.startsWith(it) }

  private fun cleanDirectory(dir: File, topLevel: Boolean) {
    if (!dir.exists()) return
    if (isEmulatorOwned(dir)) return
    dir.listFiles().orEmpty().forEach { file ->
      if (file.isDirectory) {
        cleanDirectory(file, topLevel = false)
        if (file.listFiles().isNullOrEmpty()) file.delete()
      } else if (!topLevel && file.length() <= MAX_SMALL_CACHE_BYTES) {
        file.delete()
      }
    }
  }

  /** Oldest-first deletion of re-creatable cache files until the budget holds. */
  private fun enforceBudget(dir: File, budgetBytes: Long) {
    if (!dir.exists()) return
    val files = dir.walkTopDown().filter { it.isFile && !it.path.contains("/moudie-") }.toList()
    var total = files.sumOf { it.length() }
    if (total <= budgetBytes) return
    val now = System.currentTimeMillis()
    for (file in files.sortedBy { it.lastModified() }) {
      if (total <= budgetBytes) break
      if (now - file.lastModified() < MINIMUM_AGE_MS) continue
      val size = file.length()
      if (file.delete()) total -= size
    }
  }
}
