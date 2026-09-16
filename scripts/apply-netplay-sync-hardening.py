from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace(path: str, old: str, new: str) -> None:
    file = ROOT / path
    text = file.read_text(encoding="utf-8-sig")
    if old not in text:
        raise SystemExit(f"Expected synchronization pattern not found in {path}: {old[:120]!r}")
    file.write_text(text.replace(old, new), encoding="utf-8")


# Reliable input delivery: emulator lockstep cannot safely use Socket.IO's
# volatile mode because a transient mobile handover can discard a frame.
replace(
    "server/netplay.ts",
    'socket.to(channel).volatile.emit("netplay:ps1-input",',
    'socket.to(channel).emit("netplay:ps1-input",',
)
replace(
    "server/netplay.ts",
    'socket.to(channel).volatile.emit("netplay:universal-input",',
    'socket.to(channel).emit("netplay:universal-input",',
)

# The Android quality monitor can calculate a larger buffer for high RTT/loss.
# Keep the server/client negotiation range identical so the recommendation is
# not silently discarded at the relay.
replace(
    "server/netplay.ts",
    'if (!Number.isInteger(delay) || delay < 2 || delay > 8) return;',
    'if (!Number.isInteger(delay) || delay < 2 || delay > 45) return;',
)

for path in (
    "modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/UniversalNetplayClient.kt",
    "modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/Ps1NetplayClient.kt",
):
    replace(path, 'if (delay in 2..20) {', 'if (delay in 2..45) {')

# Apply measured quality to an active lockstep session through the relay's
# authoritative delay-update event instead of freezing the launch-time delay.
universal_quality_old = '''onQuality = { quality -> runOnUiThread { netplayQuality = quality; if (!lockstepActive.get()) netplayInputDelayFrames = quality.recommendedInputDelayFrames(); updateMetric(null) } },'''
universal_quality_new = '''onQuality = { quality -> runOnUiThread {
        netplayQuality = quality
        val recommended = quality.recommendedInputDelayFrames()
        if (lockstepActive.get()) {
          if (recommended != netplayInputDelayFrames) {
            val reason = if (recommended > netplayInputDelayFrames) "quality" else "stable"
            netplayClient?.requestDelayIncrease(recommended, reason)
          }
        } else {
          netplayInputDelayFrames = recommended
        }
        updateMetric(null)
      } },'''
replace(
    "modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/UniversalLibretroPlayerActivity.kt",
    universal_quality_old,
    universal_quality_new,
)

ps1_quality_old = '''onQuality = { quality -> runOnUiThread {
        netplayQuality = quality
        if (!lockstepActive.get()) netplayInputDelayFrames = quality.recommendedInputDelayFrames()
        updateMetricPill(null)
      } },'''
ps1_quality_new = '''onQuality = { quality -> runOnUiThread {
        netplayQuality = quality
        val recommended = quality.recommendedInputDelayFrames()
        if (lockstepActive.get()) {
          if (recommended != netplayInputDelayFrames) {
            val reason = if (recommended > netplayInputDelayFrames) "quality" else "stable"
            netplayClient?.requestDelayIncrease(recommended, reason)
          }
        } else {
          netplayInputDelayFrames = recommended
        }
        updateMetricPill(null)
      } },'''
replace(
    "modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/PS1PlayerActivity.kt",
    ps1_quality_old,
    ps1_quality_new,
)

# Make the deployed relay E2E test configurable so it can be run against the
# actual production origin instead of being permanently pinned to a retired URL.
replace(
    "scripts/e2e/relay-e2e.cjs",
    'const base = "https://moudienet-7h7tawv.manus.space";',
    'const base = (process.env.NETPLAY_E2E_BASE_URL || "https://moudienet-7h7tawv.manus.space").replace(/\\/$/, "");',
)

print("NetPlay synchronization hardening applied successfully.")
