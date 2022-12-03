#!/bin/bash

set -eu -o pipefail

POST_SLUG="${1:-}"
if [ -z "$POST_SLUG" ]; then
    which gum 2>/dev/null || brew install gum
    POST_SLUG=$(gum input --placeholder "Post Name (e.g. your-new-post): ")
fi

# Proper slug for the post
POST_SLUG=$(echo "${POST_SLUG}" | iconv -t ascii//TRANSLIT | sed -E -e 's/[^[:alnum:]]+/-/g' -e 's/^-+|-+$//g' | tr '[:upper:]' '[:lower:]')
TIMESTAMP=`date +%Y%m%d%H%M%S`
POST_FILENAME="${TIMESTAMP}-${POST_SLUG}/index.md"

hugo new "posts/${POST_FILENAME}"

pgrep -x hugo > /dev/null || hugo server -D -F

echo "Opening blog/content/posts/${POST_FILENAME}" &&
$EDITOR "content/posts/${POST_FILENAME}"
