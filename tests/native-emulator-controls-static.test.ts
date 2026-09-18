import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const activityPath = resolve("modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/UniversalLibretroPlayerActivity.kt");
const bridgePath = resolve("modules/moudie-emulator/android/src/main/cpp/play_jni_bridge.cpp");

describe("native emulator control safeguards", () => {
  const activity = readFileSync(activityPath, "utf8");
  const bridge = readFileSync(bridgePath, "utf8");

  it("enables an analog control by default for PS1, PSP, N64 and PS2 and persists it per system", () => {
    expect(activity).toContain('preferences.getBoolean("analog-enabled-\${definition.system}", definition.system in setOf("ps1", "psp", "n64", "ps2"))');
    expect(activity).toContain('addUtilityButton("analog"');
    expect(activity).toContain('restoreControl(stick, "analog")');
    expect(activity).toContain('saveControl(stick, "analog")');
  });

  it("keeps analog editing separate from gameplay input", () => {
    expect(activity).toContain("if (!editMode) return@setOnTouchListener false");
    expect(activity).toContain("ScaleGestureDetector");
    expect(activity).toContain("stick.translationX");
    expect(activity).toContain("stick.translationY");
  });

  it("exposes N64 and PS2 through the native catalog", () => {
    const catalogPath = resolve("modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/NativeCoreCatalog.kt");
    const catalog = readFileSync(catalogPath, "utf8");
    expect(catalog).toContain('Definition("n64"');
    expect(catalog).toContain('Definition("ps2"');
    expect(catalog).toContain("EmulatorControlProfiles.N64");
    expect(catalog).toContain("EmulatorControlProfiles.PS2");
  });

  it("prevents Play! from being loaded twice through System.load and dlopen", () => {
    expect(activity).not.toContain("System.load(core.absolutePath)");
    expect(activity).toContain('System.loadLibrary("moudie_play_bridge")');
    expect(activity).toContain("nativeInitializePlayJavaVm(core.absolutePath)");
    expect(bridge).toContain("owns the FIRST");
    expect(bridge).toContain("dlopen()");
  });

  it("uses the LibretroDroid default renderer for PS2 to avoid an unnecessary post-processing shader", () => {
    expect(activity).toContain('shader = if (definition.system == "ps2") ShaderConfig.Default else ShaderConfig.Sharp');
  });

  it("initializes the Play! JavaVM and Android JNI metadata before LibretroDroid starts the core", () => {
    expect(bridge).toContain("_ZN9Framework7CJavaVM9SetJavaVMEP7_JavaVM");
    expect(bridge).toContain("_ZN7android7content25ContentResolver_ClassInfo16PrepareClassInfoEv");
    expect(bridge).toContain("_ZN7android8database16Cursor_ClassInfo16PrepareClassInfoEv");
    expect(bridge).toContain("_ZN7android3net13Uri_ClassInfo16PrepareClassInfoEv");
    expect(bridge).toContain("_ZN7android2os30ParcelFileDescriptor_ClassInfo16PrepareClassInfoEv");
  });
});