import { describe, expect, it } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");
const read = (file: string) => readFileSync(resolve(root, file), "utf8");

function readJpegSize(path: string) {
  const data = readFileSync(path);
  if (data[0] !== 0xff || data[1] !== 0xd8) throw new Error("Not a JPEG");
  let offset = 2;
  while (offset + 9 < data.length) {
    if (data[offset] !== 0xff) { offset += 1; continue; }
    const marker = data[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    const length = data.readUInt16BE(offset);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: data.readUInt16BE(offset + 3), width: data.readUInt16BE(offset + 5) };
    }
    offset += length;
  }
  throw new Error("JPEG dimensions not found");
}

describe("requested UI, wording and analog-control changes", () => {
  it("uses الساحة instead of الردهة in the Arabic dictionary", () => {
    const language = read("lib/language.tsx");
    expect(language).not.toMatch(/الردهة|ردهات|ردهة/);
    expect(language).toMatch(/lobby: "الساحة"/);
  });

  it("keeps the slogan out of every screen (icon and launch video only)", () => {
    const screens = ["app/(tabs)/index.tsx", "app/(tabs)/settings.tsx", "app/public-lobby.tsx"];
    for (const screen of screens) expect(read(screen)).not.toContain('t("slogan")');
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

  it("keeps all six emulator cores, profiles, buttons, analog input, and launch paths aligned", () => {
    const catalog = read("modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/NativeCoreCatalog.kt");
    const controls = read("modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/EmulatorControlProfiles.kt");
    const controller = read("components/customizable-controller.tsx");
    const nativeModule = read("modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/MoudieEmulatorModule.kt");
    const player = read("modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/UniversalLibretroPlayerActivity.kt");
    const expected = [
      ["fceumm_libretro_android.so", "FAMICOM", "famicom"],
      ["pcsx_rearmed_libretro_android.so", "PS1", "ps1"],
      ["ppsspp_libretro_android.so", "PSP", "psp"],
      ["genesis_plus_gx_libretro_android.so", "SEGA", "sega"],
      ["parallel_n64_libretro_android.so", "N64", "n64"],
      ["play_libretro_android.so", "PS2", "ps2"],
    ];
    for (const [core, profile, system] of expected) {
      expect(catalog).toContain(core);
      expect(controls).toContain("val " + profile);
      expect(controller).toContain(system + ":");
    }
    expect(nativeModule).toContain("NativeCoreCatalog.forSystem(system)");
    expect(controller).toContain("onButtonChange?.");
    expect(controller).toContain("onPressIn");
    expect(controller).toContain("onPressOut");
    expect(player).toContain("profile");
    expect(player).toContain("dispatchKey");
    expect(player).toContain("UniversalNetplayClient");
  });

  it("uses the uploaded MN circuit JPEG as the global screen background", () => {
    const container = read("components/screen-container.tsx");
    const background = read("components/classic-era-background.tsx");
    const imagePath = resolve(root, "assets/images/classic-era-ui-background.jpg");
    expect(container).toContain("ClassicEraBackground");
    expect(background).toContain("classic-era-ui-background.jpg");
    expect(background).toContain("ImageBackground");
    expect(statSync(imagePath).size).toBeGreaterThan(1000);
    const size = readJpegSize(imagePath);
    expect(size.width).toBe(256);
    expect(size.height / size.width).toBeCloseTo(1536 / 691, 2);
  });

  it("does not reference the legacy runtime brand assets", () => {
    const files = [
      "app.config.ts",
      "components/brand-logo.tsx",
      "app/(tabs)/index.tsx",
      "app/(tabs)/settings.tsx",
      "app/create-room.tsx",
      "app/join-room.tsx",
      "app/public-lobby.tsx",
    ];
    for (const file of files) {
      const source = read(file);
      expect(source).not.toContain("moudie-brand-icon.png");
      expect(source).not.toContain("partial-react-logo.png");
      expect(source).not.toContain("react-logo.png");
    }
  });

  it("keeps multiplayer synchronization and room voice paths wired to the native players", () => {
    const catalog = read("modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/NativeCoreCatalog.kt");
    const netplay = read("modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/UniversalNetplayClient.kt");
    const ps1Netplay = read("modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/Ps1NetplayClient.kt");
    const voice = read("components/room-voice-chat.native.tsx");
    const voiceNative = read("components/room-voice-chat-reliable.native.tsx");
    expect(catalog).toContain('val netplay: String');
    expect(catalog).toContain('"retroarch"');
    expect(catalog).toContain('"psp-network"');
    expect(catalog).toContain('"moudie-relay"');
    expect(netplay).toContain("fingerprint");
    expect(netplay).toContain("coreVersion");
    expect(netplay).toContain("frame");
    expect(ps1Netplay).toContain("fingerprint");
    expect(ps1Netplay).toContain("frame");
    expect(voice).toContain("restartIce");
    expect(voiceNative).toContain("@livekit/react-native");
    expect(voiceNative).toContain("ConnectionState");
  });
});
