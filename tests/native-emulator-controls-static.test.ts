import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const activityPath = resolve("modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/UniversalLibretroPlayerActivity.kt");
describe("native emulator control safeguards", () => {
  const activity = readFileSync(activityPath, "utf8");

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

  it("keeps Play! JavaVM initialization inside the exact libretro core instance", () => {
    expect(activity).not.toContain("System.load(core.absolutePath)");
    expect(activity).not.toContain('System.loadLibrary("moudie_play_bridge")');
    expect(activity).toContain("exact Play! library instance");
  });

  it("uses the LibretroDroid default renderer for PS2 to avoid an unnecessary post-processing shader", () => {
    expect(activity).toContain('shader = if (definition.system == "ps2") ShaderConfig.Default else ShaderConfig.Sharp');
    expect(activity).toContain('preferLowLatencyAudio = definition.system != "ps2"');
    expect(activity).toContain('Variable("play_res_multi", "1")');
  });

  it("uses vsync-driven dirty rendering for deterministic netplay", () => {
    expect(activity).toContain("GLSurfaceView.RENDERMODE_WHEN_DIRTY");
    expect(activity).toContain("Choreographer.FrameCallback");
    expect(activity).toContain("postFrameCallback");
  });

  it("keeps the patched Play! source bootstrap in the core sync pipeline", () => {
    const script = readFileSync(resolve("scripts/sync-libretro-cores.sh"), "utf8");
    expect(script).toContain("JNI_GetCreatedJavaVMs");
    expect(script).toContain("Framework::CJavaVM::SetJavaVM(javaVm)");
    expect(script).toContain("Moudie PS2 JNI bootstrap");
    expect(script).toContain("build_play_core");
    expect(script).toContain("-DGLES_COMPATIBILITY=1");
  });
});