#!/bin/bash

set -eu -o pipefail

find "${PWD}" -type f -iname '*.excalidraw' \
    -exec bash -c 'cd tools/excalidraw-exporter && yarn exec excalidraw-exporter {}' \;
