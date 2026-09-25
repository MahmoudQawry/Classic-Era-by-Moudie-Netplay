from pathlib import Path

from PIL import Image


PROJECT = Path(__file__).resolve().parents[1]
SOURCE = PROJECT / "assets/images/classic-era-new-icon.png"
TARGETS = [
    PROJECT / "assets/images/icon.png",
    PROJECT / "assets/images/splash-icon.png",
    PROJECT / "assets/images/favicon.png",
    PROJECT / "assets/images/android-icon-foreground.png",
    PROJECT / "assets/images/android-icon-background.png",
    PROJECT / "assets/images/android-icon-monochrome.png",
]


def optimized_icon() -> Image.Image:
    with Image.open(SOURCE) as original:
        image = original.convert("RGBA")
        image.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
        return image.copy()


def main() -> None:
    image = optimized_icon()
    for target in TARGETS:
        image.save(target, format="PNG", optimize=True, compress_level=9)
        print(f"optimized {target.name}: {target.stat().st_size} bytes")


if __name__ == "__main__":
    main()
