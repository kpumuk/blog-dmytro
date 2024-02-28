+++
title = "On reproducible Docker images"
subtitle = "multi-arch Docker images without immutable tags"
slug = "on-reproducible-docker-images"
date = 2024-02-27T20:08:45-05:00
publishDate = 2024-02-27T20:08:45-05:00
tags = ["docker", "ruby"]
+++

Most of the base images in the Docker registry do not offer immutable tags. This means that if you're building your Docker image based on, for example, an official Ruby image `ruby:3.3.0-slim`, it might change overnight, and the machines that have already downloaded this tag will never receive an updated image.

<!--more-->

{{<toc>}}

## Why repository maintainers do this?

The short answer is to pick up package security updates. Software is usually released much less frequently, and leaving containers as they are could lead to people using vulnerable base images. Sometimes developers can release a bug fix without bumping the version of the software; for example, see a [ruby update](https://github.com/docker-library/official-images/pull/16285) that addresses a 3.3.0 crash on ARM64 architecture.

Here are some threads where people are asking what is going on:

- [ruby: Tags updated daily??](https://github.com/docker-library/ruby/issues/307)
- [gcc: Introducing immutable tags](https://github.com/docker-library/gcc/issues/85)
- [docker: Docker Hub Immutable Image Tags Natively](https://github.com/docker/roadmap/issues/85)
- [docker-library: Prefer os tags in How to use this Image sections](https://github.com/docker-library/docs/issues/1572)

Docker official library FAQ answers the question about [what happens after the source code changes](https://github.com/docker-library/faq?tab=readme-ov-file#an-images-source-changed-in-git-now-what). In essence, the new image will be built, pushed to the repository, and re-tagged with the same tag.

## Reproducible builds

This opens an interesting case when somebody already has pulled the previous image. If the base image was updated to address a security vulnerability or a critical bug, they will never know it until they explicitly pull the tag again.

Another problem might arise after the build succeeds on a local machine, but mysteriously fails on CI because the base image packages have different versions.

To solve this, the official guidance is to use manifest digest:

```dockerfile
FROM registry.docker.com/library/ruby:3.3.0-slim@sha256:82176f375ab446b6fec6036e0b162a65df4fb50d9fd45ddc378d9adbaf407d3a AS base
```

In this case, Docker will ignore the tag (we can still use it as a hint for the reader, just need to make sure we change the version when the manifest digest is updated). We can obtain the digest by [browsing Docker Hub](https://hub.docker.com/layers/library/ruby/3.3.0-slim/images/sha256-82176f375ab446b6fec6036e0b162a65df4fb50d9fd45ddc378d9adbaf407d3a?context=explore) or by running [manifest-tool](https://github.com/estesp/manifest-tool):

```bash
manifest-tool inspect registry.docker.com/library/ruby:3.3.0-slim
```

The output will look like:

```text
Name:   registry.docker.com/library/ruby:3.3.0-slim (Type: application/vnd.oci.image.index.v1+json)
Digest: sha256:b449d4b89ee333695ee200da962aa260f3870a5a61290761a7cfb6b10791603c
 * Contains 16 manifest references (8 images, 8 attestations):
[1]     Type: application/vnd.oci.image.manifest.v1+json
[1]   Digest: sha256:82176f375ab446b6fec6036e0b162a65df4fb50d9fd45ddc378d9adbaf407d3a
[1]   Length: 1934
[1] Platform:
[1]    -      OS: linux
[1]    -    Arch: amd64
[1] # Layers: 5
...
[7]     Type: application/vnd.oci.image.manifest.v1+json
[7]   Digest: sha256:cae64ce744fa83113cbc5938e3817d8c2bf6c1ef6486ac8beca681a621380091
[7]   Length: 1936
[7] Platform:
[7]    -      OS: linux
[7]    -    Arch: arm64
[7]    - Variant: v8
[7] # Layers: 5
...
```

In addition, there is an experimental feature in Docker that allows to manipulate manifests with `docker` CLI:

```bash
docker manifest inspect registry.docker.com/library/ruby:3.3.0-slim
```

At the moment, it will print in JSON the same information available on the website.

## Multi-arch images

Now, we have a solution for reproducible builds for single-platform builds. But how will this work for multi-platform builds? For example, when Kamal builds a multi-platform image with `buildx`:

```bash
docker buildx build --platform linux/arm64,linux/amd64 .
```

The answer lies in the first lines of the `manifest-tool` output:

```text
Name:   registry.docker.com/library/ruby:3.3.0-slim (Type: application/vnd.oci.image.index.v1+json)
Digest: sha256:b449d4b89ee333695ee200da962aa260f3870a5a61290761a7cfb6b10791603c
 * Contains 16 manifest references (8 images, 8 attestations):
```

We can actually use the digest of the manifest itself to reference a multi-platform base image:

```ruby
FROM registry.docker.com/library/ruby@sha256:b449d4b89ee333695ee200da962aa260f3870a5a61290761a7cfb6b10791603c AS base
```

## Bonus: deploying Ruby 3.3.0 on ARM64

If you have tried to use Ruby 3.3.0 to deploy a Ruby on Rails application, you might have been greeted with a crash:

```text
 => ERROR [linux/arm64 build 6/6] RUN SECRET_KEY_BASE_DUMMY=1 ./bin/rails assets:precompile                                                                     0.3s
------
 > [linux/arm64 build 6/6] RUN SECRET_KEY_BASE_DUMMY=1 ./bin/rails assets:precompile:
0.287 /usr/local/bundle/ruby/3.3.0/gems/concurrent-ruby-1.2.3/lib/concurrent-ruby/concurrent/atomic/lock_local_var.rb:14: [BUG] Segmentation fault at 0x0039ffffa97e06c0
0.287 ruby 3.3.0 (2023-12-25 revision 5124f9ac75) [aarch64-linux]
0.287
0.287 -- Control frame information -----------------------------------------------
0.287 c:0096 p:---- s:0524 e:000523 CFUNC  :resume
...
0.290 Segmentation fault
------
WARNING: No output specified with docker-container driver. Build result will only remain in the build cache. To push result image into registry use --push or to load image into docker use --load
Dockerfile:38
--------------------
  36 |
  37 |     # Precompiling assets for production without requiring secret RAILS_MASTER_KEY
  38 | >>> RUN SECRET_KEY_BASE_DUMMY=1 ./bin/rails assets:precompile
  39 |
  40 |
--------------------
ERROR: failed to solve: process "/bin/sh -c SECRET_KEY_BASE_DUMMY=1 ./bin/rails assets:precompile" did not complete successfully: exit code: 139
```

There is a [bug](https://bugs.ruby-lang.org/issues/20085) in Ruby 3.3.0, which has been addressed, but a new Ruby patch version has not been released yet. If you have already pulled the image from the registry, you can either update the image and continue using the tag, or you can specify the manifest digest of the recently rebuilt image:

```ruby
# Make sure Ruby version matches .ruby-version
#   manifest-tool inspect registry.docker.com/library/ruby:3.3.0-slim
FROM registry.docker.com/library/ruby@sha256:b449d4b89ee333695ee200da962aa260f3870a5a61290761a7cfb6b10791603c AS base
```
