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
    local idx=$1
    local cfg=$2
    nginx -c "$PWD/${cfg}" -g "pid $PWD/nginx.pid;"
    psbench -format=csv -ppid=$(cat nginx.pid) -wait=100ms -verbose > "data/${idx}-$(basename "${cfg}" .conf).csv" &
    while :; do
        curl --http1.1 "http://127.0.0.1:${NGINX_PORT}/" &> /dev/null && break
    done
}

function stop-nginx() {
    # Stop benchmark process
    kill %% 2> /dev/null || true
    # Stop nginx
    nginx -g "pid $PWD/nginx.pid;" -s stop 2>/dev/null || true
}

# Make sure Nginx is not running
stop-nginx

echo "Small headers with client_header_buffer_size=1k"
start-nginx 1 "nginx/nginx-sm-buffer-sm.conf"
${DRILL_CMD} --tags small
stop-nginx

echo "Small headers with client_header_buffer_size=10k"
start-nginx 2 "nginx/nginx-sm-buffer-lg.conf"
${DRILL_CMD} --tags small
stop-nginx

echo "Small headers with client_header_buffer_size=128k"
start-nginx 3 "nginx/nginx-sm-buffer-hg.conf"
${DRILL_CMD} --tags small
stop-nginx

echo "Large headers with client_header_buffer_size=1k"
start-nginx 4 "nginx/nginx-sm-buffer-sm.conf"
${DRILL_CMD} --tags large
stop-nginx

echo "Large headers with client_header_buffer_size=10k"
start-nginx 5 "nginx/nginx-sm-buffer-lg.conf"
${DRILL_CMD} --tags large
stop-nginx

echo "Large headers with client_header_buffer_size=128k"
start-nginx 6 "nginx/nginx-sm-buffer-hg.conf"
${DRILL_CMD} --tags large
stop-nginx

echo "Large headers with large_client_header_buffers 8 16k"
start-nginx 7 "nginx/nginx-lg-buffer.conf"
${DRILL_CMD} --tags large
stop-nginx
