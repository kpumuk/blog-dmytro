#!/bin/bash

set -eu -o pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd "${script_dir}/.." && pwd)
exporter_dir="${repo_root}/tools/excalidraw-exporter"

find "${PWD}" -type f -iname '*.excalidraw' \
    -exec bash -lc 'cd "$1" && yarn exec excalidraw-exporter "$2"' _ "${exporter_dir}" '{}' \;
