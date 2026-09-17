from pathlib import Path

path = Path("server/db.ts")
text = path.read_text(encoding="utf-8")
old = 'system: "psp" | "nes" | "sega" | "ps1";'
new = 'system: "psp" | "nes" | "sega" | "ps1" | "n64" | "ps2";'
if old not in text:
    if new in text:
        print("server/db.ts already patched")
    else:
        raise SystemExit("server/db.ts system type anchor not found")
else:
    path.write_text(text.replace(old, new, 1), encoding="utf-8")
    print("server/db.ts patched for N64 + PS2")
