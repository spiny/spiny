#!/usr/bin/env bash
#
# Regenerate every Spiny app-icon asset from a single master image.
#
# Source of truth : assets/icon-source.png  (1024x1024, transparent background)
# Outputs         : assets/images/*.png  (consumed by app.json / expo prebuild)
#
# Requires ImageMagick v7 (`magick`). On Debian/Ubuntu: sudo apt install imagemagick
#
# Design:
#   - Background  : dark navy  (#19193b)
#   - Foreground  : the hedgehog, colours untouched
#   - Accent      : a gold ring / frame (#D4AF37) around the icon
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/assets/icon-source.png"
OUT="$ROOT/assets/images"

DARK="#19193b"   # icon + splash background
GOLD="#D4AF37"   # ring / frame accent
SIZE=1024        # master working size

command -v magick >/dev/null 2>&1 || { echo "error: ImageMagick (magick) is required" >&2; exit 1; }
[ -f "$SRC" ] || { echo "error: missing master $SRC" >&2; exit 1; }
mkdir -p "$OUT"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Tight crop of the hedgehog so every variant scales predictably.
HEDGE="$TMP/hedgehog.png"
magick "$SRC" -trim +repage "$HEDGE"

echo "==> icon.png            (full-bleed: dark bg + hedgehog + gold frame)"
magick -size ${SIZE}x${SIZE} xc:"$DARK" \
  \( "$HEDGE" -resize 740x740 \) -gravity center -composite \
  -fill none -stroke "$GOLD" -strokewidth 22 \
  -draw "roundrectangle 56,56 968,968 150,150" \
  "$OUT/icon.png"

echo "==> android-icon-foreground.png   (hedgehog inside adaptive safe zone)"
magick -size ${SIZE}x${SIZE} xc:none \
  \( "$HEDGE" -resize 560x560 \) -gravity center -composite \
  "$OUT/android-icon-foreground.png"

echo "==> android-icon-background.png   (dark bg + gold ring within mask viewport)"
magick -size ${SIZE}x${SIZE} xc:"$DARK" \
  -fill none -stroke "$GOLD" -strokewidth 16 \
  -draw "circle 512,512 512,837" \
  "$OUT/android-icon-background.png"

echo "==> android-icon-monochrome.png   (white silhouette for themed icons)"
magick "$HEDGE" -fill white -colorize 100 \
  -resize 560x560 -background none -gravity center -extent ${SIZE}x${SIZE} \
  "$OUT/android-icon-monochrome.png"

echo "==> splash-icon.png     (hedgehog on transparent, shown over dark splash)"
magick -size ${SIZE}x${SIZE} xc:none \
  \( "$HEDGE" -resize 820x820 \) -gravity center -composite \
  "$OUT/splash-icon.png"

echo "==> favicon.png         (48x48 web tab icon)"
magick "$OUT/icon.png" -resize 48x48 "$OUT/favicon.png"

echo "Done. Run \`npx expo prebuild -p android\` to regenerate native launcher icons."
