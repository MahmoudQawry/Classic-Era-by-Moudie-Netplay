import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("release regression guards", () => {
  it("keeps the exact startup video and unmutes its original audio track", () => {
    const intro = read("components/moudie-launch-intro.tsx");
    expect(intro).toContain("classic-era-official-boot.mp4");
    expect(intro).toContain("VideoView");
    expect(intro).toContain("player.muted = false");
  });

  it("uses the canonical MN adaptive icon layers", () => {
    const config = read("app.config.ts");
    expect(config).toContain("android-icon-foreground.png");
    expect(config).toContain("android-icon-background.png");
    expect(config).toContain("android-icon-monochrome.png");
    expect(config).not.toMatch(/foregroundImage:\s*"\.\/assets\/images\/classic-era-new-icon\.png"/);
  });

  it("renders the supplied 691x1536 MN circuit artwork through the global background", () => {
    const background = read("components/classic-era-background.tsx");
    const container = read("components/screen-container.tsx");
    expect(background).toContain('viewBox="0 0 691 1536"');
    expect(background).toContain("#25eaff");
    expect(container).toContain("ClassicEraBackground");
  });

  it("keeps voice signalling and reconnect recovery alive", () => {
    const voice = read("components/room-voice-chat-reliable.native.tsx");
    const relay = read("cloudflare-netplay/src/index.ts");
    expect(voice).toContain("voice:signal");
    expect(voice).toContain("restartIce");
    expect(voice).toContain("ensurePeers");
    expect(relay).toContain('msg?.event==="voice:signal"');
  });

  it("keeps PS1 CD metadata/audio and standard pad defaults", () => {
    const room = read("app/ps1/[roomId].tsx");
    const native = read("modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/MoudieEmulatorModule.kt");
    expect(room).toContain('".cue"');
    expect(room).toContain('".m3u"');
    expect(native).toContain("detectRawBinSectorMode");
    expect(native).toContain('pcsx_rearmed_nocdaudio');
    expect(native).toContain('pcsx_rearmed_noxadecoding');
    expect(native).toContain('pcsx_rearmed_pad1type');
    expect(native).toContain('pcsx_rearmed_multitap');
    expect(native).toContain("preferLowLatencyAudio = false");
  });

  it("requires the official video to be restored before Android prebuild", () => {
    const workflow = read(".github/workflows/android-build-reset.yml");
    expect(workflow).toContain("git show 06c1bc6a78fe197698f6c52071d730532534637b:assets/videos/classic-era-official-boot.mp4");
    expect(workflow).toContain("Canonical 691x1536 MN circuit background is wired globally.");
  });
});
