+++
title = "On nginx client headers parsing"
subtitle = "a journey into debugging and benchmarking nginx"
slug = "on-nginx-client-headers-parsing"
date = 2022-11-03T10:29:21-04:00
+++

Nginx is a powerful HTTP server, often used as a reverse proxy for all kinds of service configurations. But even though it is well documented and understood, there are still questions that have contradictory or incomplete answers. One of them is HTTP client header parsing configuration settings, which you normally tweak when nginx returns error 400 and you see "client sent too long header line" in the log.

<!--more-->

{{< toc >}}

## Configuration settings

In nginx, there are two configuration settings controlling buffer sizes for HTTP client headers:

> **[`client_header_buffer_size`](http://nginx.org/en/docs/http/ngx_http_core_module.html#client_header_buffer_size)** (default: `1k`) \
> Sets buffer size for reading client request header. For most requests, a buffer of 1K bytes is enough. However, if a request includes long cookies, or comes from a WAP client, it may not fit into 1K. If a request line or a request header field does not fit into this buffer then larger buffers, configured by the `large_client_header_buffers` directive, are allocated.
>
> **[`large_client_header_buffers`](http://nginx.org/en/docs/http/ngx_http_core_module.html#large_client_header_buffers)** (default: `4 8k`) \
> Sets the maximum number and size of buffers used for reading large client request header. A request line cannot exceed the size of one buffer, or the 414 (Request-URI Too Large) error is returned to the client. A request header field cannot exceed the size of one buffer as well, or the 400 (Bad Request) error is returned to the client. Buffers are allocated only on demand. By default, the buffer size is equal to 8K bytes. If after the end of request processing a connection is transitioned into the keep-alive state, these buffers are released.

Which setting do I change if I expect a large URL (with a lot of filter options)? What happens if I use a large JWT token as an authorization header between my micro-services? Let's try to understand what role the values play in request parsing.

## Understanding how nginx parses the HTTP header

When nginx begins processing a new HTTP request, it allocates a buffer of size `client_header_buffer_size`, and proceeds to read the request line by line into this buffer, starting with the first line of the request `GET / HTTP/1.1`.

If at some point the end of the buffer is reached, nginx tries to allocate another buffer of size `large_client_header_buffers`, and copies the partially read header line into it (if the buffer ended precisely at the end of the header line, nothing is copied). Then newly allocated buffer replaces the previous one as the reading buffer and gets added to the linked list of "busy" buffers so that nginx can reconstruct the data later on.

The process can end with one of the following outcomes (I will skip network connectivity issues, timeouts, and memory limits):

- All the headers are read successfully into a chain of buffers
- One of the headers did not fit in either the client header buffer or a large client header buffer
- Number of large client header buffers reached the limit

Let's look at a specific example. Here client sends the following request to nginx configured with default settings (`client_header_buffer_size` is set to `1k`, and `large_client_header_buffers` allows 4 buffers of `8k` each):

```text
GET / HTTP/1.1
Host: 127.0.0.1:9999
User-Agent: curl/7.79.1
Accept: */*
A: 1....<skipped 8kb>
B: hello
C: 1....<skipped 8kb>
D: world
E: 1....<skipped 8kb>
```

Let's walk through the nginx algorithm:

1. Start reading HTTP header — URL, Host, User-Agent, Accept headers
2. Read the `A` header until the end of the client header buffer reached (1k)
3. Allocate a large client header buffer (#1), copy the beginning of the header, and adjust the end of the client header buffer to point to the end of the `Accept` header
4. Read the remaining of the `A` header (as it was only able to read less than 1 kB of it)
5. Start reading the `B` header. It is small, but the header `A` filled almost all the buffer (leaving only a few bytes), so nginx has to allocate another buffer. **Please note, that it does not try to fit this header into the first buffer, even though there is still space left.**
6. Allocate another large buffer (#2), copy the beginning of header `B`, and read the remaining of it from the socket.
7. Start reading header `C`. Again, it does not fit into the buffer, so nginx allocates another buffer (#3), copies the beginning, and reads the remaining.
8. With header `D` the same situation — it does not fit, so nginx allocates one more buffer (#4).
9. As nginx is trying to read `E`, it runs out of space, and since we already allocated 4 buffers, the request fails with error 400.

Here is the illustration of the memory layout during the HTTP request processing:

{{< figure lightsrc="memory-layout-light.svg" darksrc="memory-layout-dark.svg" caption="Memory buffers layout in nginx after the request" >}}

It is apparent, that memory utilization is not the best in this case, and we could have an errored request even though theoretically more than enough memory was allocated.

## Experimenting with nginx

Let's confirm this. We will play with the default configuration file, and will only enable debug log to watch memory allocations. Here is how to Docker in debug mode, with debug log streaming into your terminal:

```bash
docker run -p 9999:80 -d=false nginx:1.23-alpine \
       nginx-debug -g 'daemon off; error_log stderr debug;'
```

### Scenario 1: Normal HTTP request

```bash
curl -I http://127.0.0.1:9999
```

We can immediately see our client header buffer allocation:

```text
2022/11/04 23:08:43 [debug] 34#34: *4 malloc: 0000FFFFB0301AA0:1024
2022/11/04 23:08:43 [debug] 34#34: *4 free: 0000FFFFB0301AA0
```

### Scenario 2: Large header

```bash
curl -I -H "A: $(printf '%02000d')" http://127.0.0.1:9999
```

This is getting interesting:

```text
2022/11/04 23:16:16 [debug] 30#30: *8 malloc: 0000FFFF804245B0:1024
2022/11/04 23:16:16 [debug] 30#30: *8 http alloc large header buffer
2022/11/04 23:16:16 [debug] 30#30: *8 malloc: 0000FFFF803E2C50:8192
2022/11/04 23:16:16 [debug] 30#30: *8 http large header alloc: 0000FFFF803E2C50 8192
2022/11/04 23:16:16 [debug] 30#30: *8 http large header copy: 947
2022/11/04 23:16:16 [debug] 30#30: *8 free: 0000FFFF804245B0
2022/11/04 23:16:16 [debug] 30#30: *8 free: 0000FFFF803E2C50
```

We can see that part of the header (947 bytes) were read into the client header buffer, and then copied into a newly allocated larger header buffer.

### Scenario 3: Small header following a larger header

```bash
curl -I -H "A: $(printf '%08184d')" -H "B: hello world" http://127.0.0.1:9999
```

As we predicted, another large buffer was allocated.

```text
2022/11/04 23:19:56 [debug] 30#30: *9 malloc: 0000FFFF804245C0:1024
2022/11/04 23:19:56 [debug] 30#30: *9 http alloc large header buffer
2022/11/04 23:19:56 [debug] 30#30: *9 malloc: 0000FFFF803E2C60:8192
2022/11/04 23:19:56 [debug] 30#30: *9 http large header alloc: 0000FFFF803E2C60 8192
2022/11/04 23:19:56 [debug] 30#30: *9 http large header copy: 947
2022/11/04 23:19:56 [debug] 30#30: *9 http alloc large header buffer
2022/11/04 23:19:56 [debug] 30#30: *9 malloc: 0000FFFF803F9330:8192
2022/11/04 23:19:56 [debug] 30#30: *9 http large header alloc: 0000FFFF803F9330 8192
2022/11/04 23:19:56 [debug] 30#30: *9 http large header copy: 3
```

### Scenario 4: Reproduce error 400 using a mix of large and small headers

Now it is time to reproduce the scenario from the beginning of this post:

```bash
curl -I \
    -H "A: $(printf '%08184d')" \
    -H "B: hello" \
    -H "C: $(printf '%08184d')" \
    -H "D: world" \
    -H "E: $(printf '%08184d')" \
    http://127.0.0.1:9999
```

The response from nginx is:

```text
HTTP/1.1 400 Bad Request
Server: nginx/1.23.2
Date: Fri, 04 Nov 2022 23:23:09 GMT
Content-Type: text/html
Content-Length: 233
Connection: close
```

And we can see the error in nginx logs:

```text
2022/11/04 23:23:09 [debug] 30#30: *12 http alloc large header buffer
2022/11/04 23:23:09 [info] 30#30: *12 client sent too long header line: "E: 0000..." while reading client request headers, client: 172.17.0.1, server: localhost, request: "HEAD / HTTP/1.1", host: "127.0.0.1:9999"
```

I encourage you to go and play with nginx in debug mode, there is a lot of interesting things going on under the hood!

## Benchmarking nginx

Now that we have a clear understanding of how nginx processes headers, and how the configuration settings work, let's see if we can decide on how nginx should be configured based on the performance characteristics of the change:

- Do we increase `client_header_buffer_size` to some random large number (for example, suggested [here](https://tryhexadecimal.com/guides/http/431-request-header-fields-too-large))?
- Do we increase the `large_client_header_buffers` size or number?

I want to see how configuration options affect the reverse proxy under the following conditions:

- Browser sends regular HTTP requests, with a few common cookies (all fit in under 1kB);
- Our application implements a cookie-based session, that can grow out of the configured client header buffer size, or our API accepts a JWT token, that includes a signing certificate chain (those can grow quite large)

I also want to see, how `client_header_buffer_size` and `large_client_header_buffers` will affect the throughput of the reverse proxy.

We will use a very simple nginx configuration that allows us to test it in isolation:

```nginx
worker_processes 6;

events {
    worker_connections 1024;
}

http {
    client_header_buffer_size 1k;
    large_client_header_buffers 4 8k;

    access_log off;
    error_log off;

    server {
        listen 9999 default_server;

        location / {
            return 200 "OK";
        }

        location = /basic_status {
            stub_status;
        }
    }
}
```

I will use [drill](https://github.com/fcsonline/drill) to generate load, and run both on the same Apple M1 Max machine (I want to maximize the resources utilization, which is hard to do with Docker on Mac). The machine has 8 high-performance CPU cores, so I will run nginx with 6 workers (spoiler alert — it does not use CPU much).

```yaml
concurrency: 500
base: "http://127.0.0.1:9999"
iterations: 1000000
rampup: 0

plan:
  - name: Request with small headers
    request:
      url: /
      headers:
        A: "header1"
        B: "header2"
        C: "header3"
    tags: ["small"]

  - name: Request with large headers
    request:
      url: /
      headers:
        A: "header1"
        B: "..... <skipped 8184 bytes> ....."
        C: "header3"
    tags: ["large"]
```

And finally, the script to run benchmarks:

```bash
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

# Make sure nginx is not running
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
```

Let's look at the results.

### Small headers with `client_header_buffer_size` tuned

| Value  |       #/s | 99.5pct |
| ------ | --------: | ------: |
| `1k`   | 94,364.63 |     7ms |
| `10k`  | 94,275.11 |     7ms |
| `128k` | 93,695.96 |     8ms |

Memory usage looks normal. After all, this is what nginx was built for: relatively small headers and a high load.

{{< figure lightsrc="nginx-memory-small-headers-light.svg" darksrc="nginx-memory-small-headers-dark.svg" caption="Memory usage for requests with small headers" >}}
{{< figure lightsrc="nginx-cpu-small-headers-light.svg" darksrc="nginx-cpu-small-headers-dark.svg" caption="CPU usage for requests with small headers" >}}

### Large headers with `client_header_buffer_size` tuned

| Value  |       #/s | 99.5pct |
| ------ | --------: | ------: |
| `1k`   | 49,184.25 |    10ms |
| `10k`  | 49,075.34 |    10ms |
| `128k` | 48,930.94 |    10ms |

This gets very interesting. With default settings, nginx starts consuming 5x more memory than it normally would, while with tuned settings the memory usage did not change from the previous test. If we take a look at the benchmark, there are 3 headers: small, large (taking the whole large buffer), and small. Following the nginx algorithm, we know it will allocate 3 buffers for this case: default (1k), large (8k, to put header `B` in there), and another large (for header `C`).

{{< figure lightsrc="nginx-memory-large-headers-light.svg" darksrc="nginx-memory-large-headers-dark.svg" caption="Memory usage for requests with large headers" >}}
{{< figure lightsrc="nginx-cpu-large-headers-light.svg" darksrc="nginx-cpu-large-headers-dark.svg" caption="CPU usage for requests with large headers" >}}

### Large headers with `large_client_header_buffers` tuned

| Value   |       #/s | 99.5pct |
| ------- | --------: | ------: |
| `8 16k` | 48,647.40 |    10ms |

And this confirms our assumption. With the increased large headers buffer, nginx now only needs to allocate 2 buffers (default and large, big enough for `B` and `C`). We can see how memory usage drops significantly.

{{< figure lightsrc="nginx-memory-huge-headers-light.svg" darksrc="nginx-memory-huge-headers-dark.svg" caption="Memory usage for requests with large headers and increased large buffers" >}}
{{< figure lightsrc="nginx-cpu-huge-headers-light.svg" darksrc="nginx-cpu-huge-headers-dark.svg" caption="CPU usage for requests with large headers and increased large buffers" >}}

## Recommendations

It is time to decide how to configure your nginx. It seems like the best advice would be to set `client_header_buffer_size` large enough to fit most of your expected headers, and set `large_client_header_buffers` larger (8 kB or 1.5–2x the size of `client_header_buffer_size`). I have rarely seen headers larger than `10k` in size, which seems to be a pretty safe value:

```nginx
client_header_buffer_size 10k;
large_client_header_buffers 8 16k;
```

If you deploy behind Amazon API Gateway, then the limit should not be set higher than 10 kB, as it is a [hard limit](https://docs.aws.amazon.com/apigateway/latest/developerguide/limits.html) that cannot be changed (see "Total combined size of request line and header values" — 10,240 bytes).

Thank you for sticking with me through the whole endeavor. Configuration files and scripts used in this benchmark are in the [blog repository](https://github.com/kpumuk/blog-dmytro/tree/main/supplementary/nginx-headers-benchmark/), process statistics captured using [psbench](https://github.com/kpumuk/psbench), and the graphs are produced using [gnuplot script](https://github.com/kpumuk/blog-dmytro/blob/main/supplementary/nginx-headers-benchmark/benchmark.gp). You can find me in some social networks (see the links below), and please let me know what you do think about all this.

## Changes

- **2022-11-18** — Added CPU usage graphs, and regenerated metrics data using custom tool [psbench](https://github.com/kpumuk/psbench).
