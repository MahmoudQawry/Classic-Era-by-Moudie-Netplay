package expo.modules.moudieemulator

import android.content.Context
import java.io.File

/**
 * Bounded, safe cleanup for everything the emulator writes on its own.
 *
 * Two kinds of pile-up happen on a real phone:
 *
 *  1. Every game that is opened from a document picker is copied into the app
 *     cache so the native core can read it as a normal file. Those copies are
 *     hundreds of megabytes each and nothing removed them, so the cache grew
 *     until Android started reclaiming the app during play.
 *  2. Interrupted writes leave `.tmp` files behind (a state, a core copy, a game
 *     copy) that are never referenced again.
 *
 * Only re-creatable cache content is touched here. ROMs, BIOS files, save
 * states, controller layouts and anything the user chose are never deleted: the
 * cache copies are re-created from the source file the moment the game starts
 * again.
 */
object MoudieStorageMaintenance {
  /** Cache budget for the copied game images (the biggest consumer). */
  private const val GAME_CACHE_BUDGET_BYTES = 1500L * 1024L * 1024L
  /** Never delete a copy that was used in the last few minutes. */
  private const val MINIMUM_AGE_MS = 5L * 60L * 1000L
  private const val MAX_STATE_SLOTS = 5

  data class Report(val reclaimedBytes: Long, val removedFiles: Int, val cacheBytes: Long)

  fun run(context: Context): Report {
    var reclaimed = 0L
    var removed = 0

    for (directory in gameCacheDirectories(context)) {
      val result = pruneByBudget(directory, GAME_CACHE_BUDGET_BYTES)
      reclaimed += result.first
      removed += result.second
    }
    for (directory in temporaryDirectories(context)) {
      val result = removeTemporaryFiles(directory)
      reclaimed += result.first
      removed += result.second
    }
    // A save slot also writes a .tmp file while it is being written.
    val states = File(context.filesDir, "").listFiles().orEmpty().filter { it.isDirectory && it.name.startsWith("moudie-") && it.name.endsWith("states") }
    for (directory in states) {
      val result = removeTemporaryFiles(directory)
      reclaimed += result.first
      removed += result.second
    }
    return Report(reclaimed, removed, cacheBytes(context))
  }

  /** Deletes stale `.tmp` files and empty directories. */
  fun cleanTemporary(context: Context) {
    for (directory in temporaryDirectories(context)) removeTemporaryFiles(directory)
  }

  fun cacheBytes(context: Context): Long {
    val root = File(context.cacheDir, "")
    return root.walkTopDown().filter { it.isFile }.sumOf { it.length() }
  }

  private fun gameCacheDirectories(context: Context): List<File> =
    context.cacheDir.listFiles().orEmpty().filter { it.isDirectory && it.name.startsWith("moudie-") && it.name.endsWith("-games") }

  private fun temporaryDirectories(context: Context): List<File> {
    val roots = listOf(context.cacheDir, File(context.filesDir, "moudie-tmp"), File(context.cacheDir, "moudie-tmp"))
    return roots.filter { it.isDirectory }
  }

  /** Oldest-first deletion until the directory fits the budget. */
  private fun pruneByBudget(directory: File, budgetBytes: Long): Pair<Long, Int> {
    val files = directory.listFiles().orEmpty().filter { it.isFile }
    var total = files.sumOf { it.length() }
    if (total <= budgetBytes) return 0L to 0
    val now = System.currentTimeMillis()
    var reclaimed = 0L
    var removed = 0
    val oldestFirst = files.sortedBy { it.lastModified() }
    for (file in oldestFirst) {
      if (total <= budgetBytes) break
      if (now - file.lastModified() < MINIMUM_AGE_MS) continue
      val size = file.length()
      if (file.delete()) {
        total -= size
        reclaimed += size
        removed += 1
      }
    }
    return reclaimed to removed
  }

  private fun removeTemporaryFiles(directory: File): Pair<Long, Int> {
    var reclaimed = 0L
    var removed = 0
    val children = directory.listFiles().orEmpty()
    for (child in children) {
      if (child.isDirectory) {
        val nested = removeTemporaryFiles(child)
        reclaimed += nested.first
        removed += nested.second
        if (child.listFiles().isNullOrEmpty()) child.delete()
        continue
      }
      val stale = child.name.endsWith(".tmp") || child.name.endsWith(".part") || (child.length() == 0L && child.name.contains(".slot"))
      if (stale && child.delete()) {
        reclaimed += child.length()
        removed += 1
      }
    }
    return reclaimed to removed
  }

  /** Keeps at most [MAX_STATE_SLOTS] files for one game key; used by the player. */
  fun stateSlotCount(directory: File, stateKey: String): Int =
    directory.listFiles().orEmpty().count { it.isFile && it.name.startsWith("$stateKey.slot") }
}
