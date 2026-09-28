import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");
const read = (file: string) => readFileSync(resolve(root, file), "utf8");

/**
 * The delivered Android package must install and run on every release from
 * Android 8.0 (API 26) through the current Android version. That promise is
 * carried by three build files and one manifest attribute; if any of them drops
 * back to an older floor or an older target, the package silently stops
 * matching the supported matrix.
 */
describe("Android support matrix", () => {
  const appConfig = read("app.config.ts");
  const gradleProperties = read("android/gradle.properties");
  const moduleGradle = read("modules/moudie-emulator/android/build.gradle");
  const manifest = read("android/app/src/main/AndroidManifest.xml");

  it("keeps Android 8.0 (API 26) as the floor everywhere", () => {
    expect(appConfig).toContain("minSdkVersion: 26");
    expect(gradleProperties).toContain("android.minSdkVersion=26");
    expect(moduleGradle).toContain('safeExtGet("minSdkVersion", 26)');
    expect(appConfig).not.toContain("minSdkVersion: 24");
    expect(gradleProperties).not.toContain("android.minSdkVersion=24");
  });

  it("compiles and targets the newest supported Android platform", () => {
    expect(appConfig).toContain("compileSdkVersion: 36");
    expect(appConfig).toContain("targetSdkVersion: 36");
    expect(moduleGradle).toContain('safeExtGet("compileSdkVersion", 36)');
    expect(moduleGradle).toContain('safeExtGet("targetSdkVersion", 36)');
  });

  it("declares the large heap the heavy emulator cores need", () => {
    expect(manifest).toContain('android:largeHeap="true"');
    expect(manifest).toContain('android:hardwareAccelerated="true"');
    // The attribute must survive `expo prebuild`, so it also lives in a plugin.
    const plugin = read("plugins/with-android-emulator-tuning.js");
    expect(plugin).toContain('application.$["android:largeHeap"] = "true"');
    expect(plugin).toContain('set("android.minSdkVersion", "26")');
    expect(appConfig).toContain("./plugins/with-android-emulator-tuning");
  });

  it("guards every platform API newer than the Android 8 floor", () => {
    const profile = read("modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/MoudieDeviceProfile.kt");
    // Thermal reporting only exists from API 29 (Android 10).
    const thermalIndex = profile.indexOf("fun thermalStatus");
    expect(thermalIndex).toBeGreaterThan(-1);
    expect(profile.slice(thermalIndex)).toContain("Build.VERSION.SDK_INT < Build.VERSION_CODES.Q");
  });
});

/**
 * The PlayStation 2 core is the heaviest one in the package. It must refuse a
 * device that cannot hold it (below 4 GB of RAM) with a readable reason instead
 * of starting a session that the system low-memory killer ends mid-game.
 */
describe("PlayStation 2 device envelope", () => {
  const profilePath = "modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/MoudieDeviceProfile.kt";
  const activityPath = "modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/UniversalLibretroPlayerActivity.kt";
  const sessionPath = "modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/MoudieSessionLog.kt";
  const maintenancePath = "modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/MoudieStorageMaintenance.kt";

  it("ships the device profile, session log and storage maintenance sources", () => {
    for (const path of [profilePath, sessionPath, maintenancePath]) {
      expect(existsSync(resolve(root, path)), `${path} must exist`).toBe(true);
    }
  });

  it("requires 4 GB of RAM and OpenGL ES 3.2 before PlayStation 2 starts", () => {
    const profile = read(profilePath);
    expect(profile).toContain("PS2_MINIMUM_TOTAL_RAM_BYTES = 4L * 1024L * 1024L * 1024L");
    // A marketing "4 GB" device reports slightly less usable memory: it must be
    // warned and guarded, not refused.
    expect(profile).toContain("PS2_CLASS_TOTAL_RAM_FLOOR_BYTES");
    expect(profile).toContain("PS2_HARD_FLOOR_TOTAL_RAM_BYTES");
    expect(profile).toContain("ps2WarningReason");
    expect(profile).toContain("supportsOpenGlEs32");
    expect(profile).toContain("0x00030002");
    const activity = read(activityPath);
    expect(activity).toContain("MoudieDeviceProfile.ps2BlockingReason(this)");
    expect(activity).toContain("showError(blocking)");
  });

  it("records why a PlayStation 2 session ended and protects memory during play", () => {
    const activity = read(activityPath);
    expect(activity).toContain("MoudieSessionLog.startSession(");
    expect(activity).toContain("MoudieSessionLog.sample(");
    expect(activity).toContain('MoudieSessionLog.endSession(this, "clean-exit');
    expect(activity).toContain("monitorMemoryPressure()");
    expect(activity).toContain("saveStateForSafety()");
    expect(activity).toContain("OutOfMemoryError");
    // The heaviest core must not pay for duplicate frame presentation.
    expect(activity).toContain('skipDuplicateFrames = definition.system == "ps2"');
    const session = read(sessionPath);
    expect(session).toContain("MAX_LOG_BYTES");
    expect(session).toContain("PREVIOUS SESSION DID NOT CLOSE CLEANLY");
  });

  it("bounds the emulator cache instead of letting game copies pile up", () => {
    const maintenance = read(maintenancePath);
    expect(maintenance).toContain("GAME_CACHE_BUDGET_BYTES");
    expect(maintenance).toContain('endsWith("-games")');
    expect(maintenance).toContain("MINIMUM_AGE_MS");
    const activity = read(activityPath);
    expect(activity).toContain("MoudieStorageMaintenance.run(this)");
  });
});
