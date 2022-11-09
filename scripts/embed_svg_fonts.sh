#!/bin/bash

set -eu -o pipefail

if [ ! -e "$1" ]; then
    echo "embed_svg_fonts.sh FILENAME.svg"
    exit 1
fi

mkdir -p tmp
[ -e "tmp/Virgil.woff2" ] || curl -o tmp/Virgil.woff2 https://excalidraw.com/Virgil.woff2
[ -e "tmp/Cascadia.woff2" ] || curl -o tmp/Cascadia.woff2 https://excalidraw.com/Cascadia.woff2

VIRGIL_URI="data:application/x-font-woff2;base64,$(base64 -i tmp/Virgil.woff2)"
CASCADIA_URI="data:application/x-font-woff2;base64,$(base64 -i tmp/Cascadia.woff2)"

sed -i .back "s#https://.*/Virgil.woff2#${VIRGIL_URI}#" "$1"
sed -i .back "s#https://.*/Cascadia.woff2#${CASCADIA_URI}#" "$1"

echo "Image dimensions described by $(grep -o 'viewBox="[^"]*"' $1)"