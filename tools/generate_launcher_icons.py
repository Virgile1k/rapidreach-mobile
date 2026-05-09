#!/usr/bin/env python3
"""Generate Android mipmaps and iOS AppIcon PNGs matching drawable/ic_splash_emblem.xml."""

from __future__ import annotations

import json
import math
import os
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]

# Same as android/app/src/main/res/drawable/ic_splash_emblem.xml (viewport 120×120)
_VIEWBOX = 120.0
_RED = (229, 57, 53, 255)  # #E53935
_WHITE = (255, 255, 255, 255)

# White plus path as closed polygon (matches pathData "M54,38h12v16h16v12..." )
_PLUS_POINTS = [
    (54, 38),
    (66, 38),
    (66, 54),
    (82, 54),
    (82, 66),
    (66, 66),
    (66, 82),
    (54, 82),
    (54, 66),
    (38, 66),
    (38, 54),
    (54, 54),
]

ANDROID_SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}

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


def render_emblem(px: int, supersample: int = 2) -> Image.Image:
    """Raster matching ic_splash_emblem: red circle + white plus."""
    ssuper = max(1, supersample)
    w = px * ssuper
    scale = w / _VIEWBOX

    im = Image.new("RGBA", (w, w), (0, 0, 0, 0))
    draw = ImageDraw.Draw(im)

    cx, cy, r = 60.0 * scale, 60.0 * scale, 44.0 * scale
    bbox = (cx - r, cy - r, cx + r, cy + r)
    draw.ellipse(bbox, fill=_RED)

    poly = [(x * scale, y * scale) for x, y in _PLUS_POINTS]
    draw.polygon(poly, fill=_WHITE)

    if ssuper > 1:
        im = im.resize((px, px), Image.Resampling.LANCZOS)
    return im.convert("RGBA")


def main() -> None:
    res = ROOT / "android" / "app" / "src" / "main" / "res"
    for folder, px in ANDROID_SIZES.items():
        out_dir = res / folder
        out_dir.mkdir(parents=True, exist_ok=True)
        img = render_emblem(px)
        for name in ("ic_launcher.png", "ic_launcher_round.png"):
            img.save(out_dir / name, "PNG")

    appicon = ROOT / "ios" / "RapidReach" / "Images.xcassets" / "AppIcon.appiconset"
    appicon.mkdir(parents=True, exist_ok=True)
    images: list[dict] = []
    for filename, px, entry in IOS_ICONS:
        img = render_emblem(px)
        dest = appicon / filename
        img.save(dest, "PNG")
        row = {**entry, "filename": filename}
        images.append(row)

    contents = {"images": images, "info": {"author": "xcode", "version": 1}}
    (appicon / "Contents.json").write_text(
        json.dumps(contents, indent=2) + "\n", encoding="utf-8"
    )

    print("Wrote Android mipmaps and iOS AppIcon set (splash emblem: red circle + white plus).")

    emblem_dir = (
        ROOT / "ios" / "RapidReach" / "Images.xcassets" / "SplashEmblem.imageset"
    )
    emblem_dir.mkdir(parents=True, exist_ok=True)
    render_emblem(256).save(emblem_dir / "splash-emblem.png", "PNG")
    (emblem_dir / "Contents.json").write_text(
        json.dumps(
            {
                "images": [
                    {
                        "filename": "splash-emblem.png",
                        "idiom": "universal",
                        "scale": "1x",
                    }
                ],
                "info": {"author": "xcode", "version": 1},
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print("Wrote ios/.../SplashEmblem.imageset for LaunchScreen.")


if __name__ == "__main__":
    os.chdir(ROOT)
    main()
