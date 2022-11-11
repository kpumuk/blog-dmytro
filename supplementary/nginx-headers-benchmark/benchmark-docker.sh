#!/bin/bash

set -eu -o pipefail

CONTAINER_IMAGE=nginx:1.23-alpine
CONTAINER_NAME=nginx-headers-bm
CONTAINER_PORT=9999
DRILL_CMD="drill --stats --benchmark benchmark.yml --quiet"

if ! which nginx drill &> /dev/null ; then
    echo "Please install nginx and drill on the machine"
    echo "    brew install nginx drill"
    exit 1
fi

# Increase the limit on the number of open files
ulimit -n 32768

function start-nginx() {
    local cfg=$1
    docker run --rm \
        --name "${CONTAINER_NAME}" \
        --publish "${CONTAINER_PORT}:${CONTAINER_PORT}" \
        --volume "$PWD/${cfg}":/etc/nginx/nginx.conf:ro \
        --detach \
        "${CONTAINER_IMAGE}"
    while :; do
        curl --http1.1 "http://127.0.0.1:${CONTAINER_PORT}/" &> /dev/null && break
    done
}

function stop-nginx() {
    docker ps --filter "name=${CONTAINER_NAME}" --filter "status=running" --format="{{.ID}}" | xargs docker kill > /dev/null || true
}

# Make sure Nginx is not running
stop-nginx

echo "Small headers with client_header_buffer_size=1k"
start-nginx "nginx/nginx-sm-buffer-sm.conf"
${DRILL_CMD} --tags small
stop-nginx

echo "Small headers with client_header_buffer_size=10k"
start-nginx "nginx/nginx-sm-buffer-lg.conf"
${DRILL_CMD} --tags small
stop-nginx

echo "Small headers with client_header_buffer_size=128k"
start-nginx "nginx/nginx-sm-buffer-hg.conf"
${DRILL_CMD} --tags small
stop-nginx

echo "Large headers with client_header_buffer_size=1k"
start-nginx "nginx/nginx-sm-buffer-sm.conf"
${DRILL_CMD} --tags large
stop-nginx

echo "Large headers with client_header_buffer_size=10k"
start-nginx "nginx/nginx-sm-buffer-lg.conf"
${DRILL_CMD} --tags large
stop-nginx

echo "Large headers with client_header_buffer_size=128k"
start-nginx "nginx/nginx-sm-buffer-hg.conf"
${DRILL_CMD} --tags large
stop-nginx

echo "Large headers with large_client_header_buffers 8 16k"
start-nginx "nginx/nginx-lg-buffer.conf"
${DRILL_CMD} --tags large
stop-nginx
