import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root=resolve(__dirname,"..");
const read=(p:string)=>readFileSync(resolve(root,p),"utf8");

describe("six-emulator release matrix",()=>{
  const systems=[
    ["nes","FCEUmm","fceumm_libretro_android.so","fceumm"],
    ["ps1","PCSX-ReARMed","pcsx_rearmed_libretro_android.so","pcsx_rearmed"],
    ["psp","PPSSPP","ppsspp_libretro_android.so","ppsspp"],
    ["sega","Genesis Plus GX","genesis_plus_gx_libretro_android.so","genesis_plus_gx"],
    ["n64","Parallel-N64","parallel_n64_libretro_android.so","parallel_n64"],
    ["ps2","Play!","play_libretro_android.so","play"],
  ] as const;

  it("keeps all six systems in the native catalog and build pipeline",()=>{
    const catalog=read("modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/NativeCoreCatalog.kt");
    const sync=read("scripts/sync-libretro-cores.sh");
    const build=read(".github/workflows/android-build-reset.yml");
    for(const [id,core,library,remote] of systems){
      expect(catalog).toContain('Definition("'+id+'"');
      expect(catalog).toContain(core);
      if(id === "ps2"){
        expect(sync).toContain("build_play_core");
      }else{
        expect(sync).toContain(`fetch_core ${remote} ${remote}`);
      }
      expect(sync).toContain(library);
    }
    expect(build).toContain("for CORE in fceumm pcsx_rearmed ppsspp genesis_plus_gx parallel_n64 play");
  });

  it("uses one application version across package, Expo, and Android",()=>{
    expect(read("package.json")).toContain('"version": "1.0.0"');
    expect(read("app.config.ts")).toContain('version: "1.0.0"');
    expect(read("android/app/build.gradle")).toContain('versionName "1.0.0"');
    expect(read("app.config.ts")).toContain("versionCode: 1");
    expect(read("android/app/build.gradle")).toContain("versionCode 1");
  });

  it("does not reintroduce the PS2 framebuffer override",()=>{
    const sync=read("scripts/sync-libretro-cores.sh");
    expect(sync).toContain("Keep Play!'s upstream GL presentation path intact");
    expect(sync).not.toContain("m_presentFramebuffer = 0");
  });
});
