from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]

# Canonical checked-in source. Do not depend on a developer's upload directory.
source = ROOT / 'assets/images/classic-era-new-icon.png'
if not source.exists():
    raise SystemExit(f'missing canonical brand image: {source}')

img = Image.open(source).convert('RGB')
icon = img.resize((1024, 1024), Image.Resampling.LANCZOS)

# Keep the checked-in native Android project aligned with app.config.ts.
# Expo does not regenerate these resources during a plain Gradle assemble.
for path in (ROOT / 'android/app/src/main/res').glob('mipmap-*/ic_launcher*.webp'):
    size = Image.open(path).size
    icon.resize(size, Image.Resampling.LANCZOS).save(path, 'WEBP', quality=96, method=6)

# The launch poster remains the canonical poster asset already checked into the repo.
poster_path = ROOT / 'assets/images/classic-era-new-poster.png'
if poster_path.exists():
    poster = Image.open(poster_path).convert('RGB')
    for path in (ROOT / 'android/app/src/main/res').glob('drawable-*/splashscreen_logo.png'):
        size = Image.open(path).size
        poster.resize(size, Image.Resampling.LANCZOS).save(path, 'PNG', optimize=True)

print('synchronized native Android brand resources from canonical assets')
