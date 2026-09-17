import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");
const read = (file: string) => readFileSync(resolve(root, file), "utf8");

describe("requested UI, wording and analog-control changes", () => {
  it("uses الساحة instead of الردهة in the Arabic dictionary", () => {
    const language = read("lib/language.tsx");
    expect(language).not.toMatch(/الردهة|ردهات|ردهة/);
    expect(language).toMatch(/lobby: "الساحة"/);
  });

  it("keeps the slogan out of every screen (icon and launch video only)", () => {
    const screens = ["app/(tabs)/index.tsx", "app/(tabs)/settings.tsx", "app/public-lobby.tsx"];
    for (const screen of screens) {
      expect(read(screen)).not.toContain('t("slogan")');
    }
  });

  it("removes the library destination and hides the tab bar", () => {
    const layout = read("app/(tabs)/_layout.tsx");
    expect(layout).not.toContain('name="library"');
    expect(layout).toContain('tabBarStyle: { display: "none" }');
  });

  it("puts a settings button in the top-left corner of the lobby", () => {
    const lobby = read("app/(tabs)/index.tsx");
    expect(lobby).toContain("styles.settingsButton");
    expect(lobby).toContain('name="cog-outline"');
  });

  it("uses the canonical MN app icon for shared internal brand chrome", () => {
    const brand = read("components/brand-logo.tsx");
    expect(brand).toContain('@/assets/images/classic-era-new-icon.png');
    expect(brand).toContain('<Image');
    expect(brand).not.toContain('<Text');
  });

  it("adds an ANALOG control to the PS1 and PSP players", () => {
    const ps1 = read("modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/PS1PlayerActivity.kt");
    const psp = read("modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/UniversalLibretroPlayerActivity.kt");
    const stick = read("modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/AnalogStickView.kt");
    for (const player of [ps1, psp]) {
      expect(player).toContain("AnalogStickView");
      expect(player).toContain("MOTION_SOURCE_ANALOG_LEFT");
      expect(player).toContain('"ANLG');
    }
    expect(stick).toContain("DEAD_ZONE");
    expect(stick).toContain("onRelease");
  });

  it("replaces push-to-talk with PUBG-style mic/speaker controls", () => {
    const voice = read("components/room-voice-chat.native.tsx");
    expect(voice).not.toContain("voicePushToTalk");
    expect(voice).not.toContain("voiceHoldToTalk");
    expect(voice).not.toContain("PushToTalk");
    expect(voice).toContain("turn:");
    expect(voice).toContain("restartIce");
    expect(voice).toContain("AppState");
    expect(voice).toContain("remoteTracksRef");
  });
});
