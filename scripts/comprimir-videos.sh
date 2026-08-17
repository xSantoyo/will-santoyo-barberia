#!/usr/bin/env bash
# Convierte los MOV originales del celular en los MP4 que sirve el sitio.
#
#   bash scripts/comprimir-videos.sh [carpeta-de-originales]
#
# Salida: content/will-barbershop/videos/corte-N-{720,1080}.mp4 y -poster.jpg
# Esa carpeta está fuera del repositorio a propósito (ver README).
#
# -map_metadata -1 NO ES OPCIONAL. Los MOV del iPhone traen la fecha de captura
# y, algunos, las coordenadas GPS del sitio donde se grabaron
# (com.apple.quicktime.location.ISO6709). Publicar eso junto a la cara de un
# cliente es dar su ubicación. La recompresión ya las descartaba de hecho, pero
# eso era una casualidad del códec, no una garantía: aquí se pide explícito, y
# al final se verifica que no sobrevivió ninguna.
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${1:-$RAIZ/_originales-video}"
OUT="$RAIZ/content/will-barbershop/videos"

FFMPEG="${FFMPEG:-ffmpeg}"
FFPROBE="${FFPROBE:-ffprobe}"
command -v "$FFMPEG" >/dev/null || { echo "Falta ffmpeg (o define FFMPEG=/ruta/ffmpeg)"; exit 1; }
command -v "$FFPROBE" >/dev/null || { echo "Falta ffprobe (o define FFPROBE=/ruta/ffprobe)"; exit 1; }

[ -d "$SRC" ] || { echo "No existe la carpeta de originales: $SRC"; exit 1; }
mkdir -p "$OUT"

# Los loops no deben durar más que la paciencia de nadie, y el celular paga
# los datos: 12 s es suficiente para que se entienda el trabajo.
SEGUNDOS=12

i=0
for f in "$SRC"/*.MOV "$SRC"/*.mov; do
  [ -e "$f" ] || continue
  i=$((i + 1))
  base="corte-$i"
  echo "=== [$i] $(basename "$f")"

  # 1080x1920 — escritorio y celulares con buena conexión
  "$FFMPEG" -y -v error -stats -t "$SEGUNDOS" -i "$f" \
    -an -map_metadata -1 -vf "scale=-2:1920,fps=30" \
    -c:v libx264 -profile:v high -level 4.1 -preset slow -crf 24 \
    -pix_fmt yuv420p -movflags +faststart "$OUT/$base-1080.mp4"

  # 720x1280 — datos móviles. Es la que reciben los teléfonos (ver VideoReel).
  "$FFMPEG" -y -v error -stats -t "$SEGUNDOS" -i "$f" \
    -an -map_metadata -1 -vf "scale=-2:1280,fps=30" \
    -c:v libx264 -profile:v main -level 3.1 -preset slow -crf 26 \
    -pix_fmt yuv420p -movflags +faststart "$OUT/$base-720.mp4"

  # Póster: primer fotograma del ya comprimido, para que calce exacto con el
  # primer cuadro del video y no se note el relevo.
  "$FFMPEG" -y -v error -i "$OUT/$base-1080.mp4" -frames:v 1 -map_metadata -1 \
    -q:v 4 "$OUT/$base-poster.jpg"

  echo "    -> $base listo"
done

[ "$i" -gt 0 ] || { echo "No se encontró ningún .MOV en $SRC"; exit 1; }

echo "=== verificación: ningún metadato de origen sobrevive"
# Solo etiquetas de metadatos (TAG:), no propiedades del códec: chroma_location
# es submuestreo de croma y no revela nada.
fallo=0
for f in "$OUT"/*.mp4 "$OUT"/*.jpg; do
  sucio=$("$FFPROBE" -v error -show_format -show_streams "$f" 2>&1 \
    | grep -E "^TAG:" \
    | grep -viE "encoder|major_brand|minor_version|compatible_brands|handler_name|vendor_id|language" || true)
  if [ -n "$sucio" ]; then
    echo "    SUCIO: $(basename "$f") -> $sucio"
    fallo=1
  fi
done
if [ "$fallo" -ne 0 ]; then
  echo "    Hay metadatos de origen. NO publicar hasta resolverlo."
  exit 1
fi
echo "    todos limpios"
