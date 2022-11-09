#!/bin/bash

set -eu -o pipefail

LIGHT_SYNTAX_THEME=monokailight
DARK_SYNTAX_THEME=monokai
CSS_PATH=themes/kpumuk/assets/syntax.css

echo "/* Light theme" > "${CSS_PATH}"
echo "   ========================================================================== */" >> "${CSS_PATH}"
echo "" >> "${CSS_PATH}"
echo "@media (prefers-color-scheme: light) {" >> "${CSS_PATH}"
hugo gen chromastyles --style="${LIGHT_SYNTAX_THEME}" >> "${CSS_PATH}"
echo "}" >> "${CSS_PATH}"

echo "" >> "${CSS_PATH}"
echo "/* Dark theme" >> "${CSS_PATH}"
echo "   ========================================================================== */" >> "${CSS_PATH}"
echo "" >> "${CSS_PATH}"
echo "@media (prefers-color-scheme: dark) {" >> "${CSS_PATH}"
hugo gen chromastyles --style="${DARK_SYNTAX_THEME}" >> "${CSS_PATH}"
echo "}" >> "${CSS_PATH}"

echo "Updated ${CSS_PATH} syntax colors"