from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
source = ROOT / "assets/images/classic-era-ui-background.jpg"
if not source.exists():
    raise SystemExit(f"missing current MN background: {source}")

img = Image.open(source).convert("RGB")
w, h = img.size
side = min(w, h)
left = (w - side) // 2
top = (h - side) // 2
icon = img.crop((left, top, left + side, top + side)).resize((1024, 1024), Image.Resampling.LANCZOS)
icon.save(ROOT / "assets/images/classic-era-new-icon.png", optimize=True)

print("generated launcher icon from the checked-in MN processor artwork")
