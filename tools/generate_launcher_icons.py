#!/usr/bin/env python3
"""Generate Android mipmap and iOS AppIcon PNGs from assets/hero-telkom-bg.jpg (center square crop)."""

from __future__ import annotations

import json
import os
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets" / "hero-telkom-bg.jpg"

ANDROID_SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}

# (filename, pixel side, Contents.json entry without filename)
IOS_ICONS: list[tuple[str, int, dict]] = [
    ("AppIcon-20@2x.png", 40, {"size": "20x20", "idiom": "iphone", "scale": "2x"}),
    ("AppIcon-20@3x.png", 60, {"size": "20x20", "idiom": "iphone", "scale": "3x"}),
    ("AppIcon-29@2x.png", 58, {"size": "29x29", "idiom": "iphone", "scale": "2x"}),
    ("AppIcon-29@3x.png", 87, {"size": "29x29", "idiom": "iphone", "scale": "3x"}),
    ("AppIcon-40@2x.png", 80, {"size": "40x40", "idiom": "iphone", "scale": "2x"}),
    ("AppIcon-40@3x.png", 120, {"size": "40x40", "idiom": "iphone", "scale": "3x"}),
    ("AppIcon-60@2x.png", 120, {"size": "60x60", "idiom": "iphone", "scale": "2x"}),
    ("AppIcon-60@3x.png", 180, {"size": "60x60", "idiom": "iphone", "scale": "3x"}),
    (
        "AppIcon-1024.png",
        1024,
        {"size": "1024x1024", "idiom": "ios-marketing", "scale": "1x"},
    ),
]


def crop_square(im: Image.Image) -> Image.Image:
    w, h = im.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    return im.crop((left, top, left + side, top + side))


def main() -> None:
    im = Image.open(SRC).convert("RGB")
    square = crop_square(im)

    res = ROOT / "android" / "app" / "src" / "main" / "res"
    for folder, px in ANDROID_SIZES.items():
        out_dir = res / folder
        out_dir.mkdir(parents=True, exist_ok=True)
        img = square.resize((px, px), Image.Resampling.LANCZOS)
        for name in ("ic_launcher.png", "ic_launcher_round.png"):
            img.save(out_dir / name, "PNG")

    appicon = (
        ROOT / "ios" / "RapidReach" / "Images.xcassets" / "AppIcon.appiconset"
    )
    images: list[dict] = []
    for filename, px, entry in IOS_ICONS:
        img = square.resize((px, px), Image.Resampling.LANCZOS)
        dest = appicon / filename
        img.save(dest, "PNG")
        row = {**entry, "filename": filename}
        images.append(row)

    contents = {"images": images, "info": {"author": "xcode", "version": 1}}
    (appicon / "Contents.json").write_text(
        json.dumps(contents, indent=2) + "\n", encoding="utf-8"
    )

    print("Wrote Android mipmaps and iOS AppIcon set.")


if __name__ == "__main__":
    os.chdir(ROOT)
    main()
