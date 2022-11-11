#!/bin/bash

set -eu -o pipefail

NGINX_PORT=9999
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
    nginx -c "$PWD/${cfg}"
    while :; do
        curl --http1.1 "http://127.0.0.1:${NGINX_PORT}/" &> /dev/null && break
    done
}

function stop-nginx() {
    nginx -s stop 2>/dev/null || true
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
