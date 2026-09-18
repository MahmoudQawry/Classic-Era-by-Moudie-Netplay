import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const activityPath = resolve("modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/UniversalLibretroPlayerActivity.kt");
const bridgePath = resolve("modules/moudie-emulator/android/src/main/cpp/play_jni_bridge.cpp");

describe("native emulator control safeguards", () => {
  const activity = readFileSync(activityPath, "utf8");
  const bridge = readFileSync(bridgePath, "utf8");

  it("enables an analog control by default for PS1, PSP and PS2 and persists it per system", () => {
    expect(activity).toContain('preferences.getBoolean("analog-enabled-\${definition.system}", definition.system in setOf("ps1", "psp", "ps2"))');
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

  it("initializes the Play! JavaVM and Android JNI metadata before LibretroDroid starts the core", () => {
    expect(bridge).toContain("_ZN9Framework7CJavaVM9SetJavaVMEP7_JavaVM");
    expect(bridge).toContain("_ZN7android7content25ContentResolver_ClassInfo16PrepareClassInfoEv");
    expect(bridge).toContain("_ZN7android8database16Cursor_ClassInfo16PrepareClassInfoEv");
    expect(bridge).toContain("_ZN7android3net13Uri_ClassInfo16PrepareClassInfoEv");
    expect(bridge).toContain("_ZN7android2os30ParcelFileDescriptor_ClassInfo16PrepareClassInfoEv");
  });
});