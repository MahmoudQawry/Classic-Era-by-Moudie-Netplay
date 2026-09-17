from pathlib import Path

path = Path("modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/NativeCoreCatalog.kt")
text = path.read_text(encoding="utf-8")
needle = '''    Definition("sega", "Sega Genesis / Mega Drive", "Genesis Plus GX", listOf("genesis_plus_gx_libretro_android.so"), setOf("bin", "md", "gen", "smd", "sms", "gg", "zip"), "retroarch", 4, 4, 4, EmulatorControlProfiles.SEGA, "moudie-sega/system"),\n  )'''
replacement = '''    Definition("sega", "Sega Genesis / Mega Drive", "Genesis Plus GX", listOf("genesis_plus_gx_libretro_android.so"), setOf("bin", "md", "gen", "smd", "sms", "gg", "zip"), "retroarch", 4, 4, 4, EmulatorControlProfiles.SEGA, "moudie-sega/system"),
    Definition("n64", "Nintendo 64", "Parallel-N64", listOf("parallel_n64_libretro_android.so"), setOf("z64", "n64", "v64", "zip"), "retroarch", 4, 4, 4, EmulatorControlProfiles.N64, "moudie-n64/system"),
    Definition("ps2", "PlayStation 2", "Play!", listOf("play_libretro_android.so"), setOf("iso", "chd", "cso"), "retroarch", 4, 4, 4, EmulatorControlProfiles.PS2, "moudie-ps2/system"),
  )'''
if needle not in text:
    raise SystemExit("NativeCoreCatalog already patched or base text changed")
path.write_text(text.replace(needle, replacement, 1), encoding="utf-8")
print("NativeCoreCatalog patched for N64 + PS2")
