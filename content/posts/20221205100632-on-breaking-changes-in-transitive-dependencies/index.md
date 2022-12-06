+++
title = "On breaking changes in transitive dependencies"
subtitle = "a story of a change, that broke Sidekiq's reliability promises"
slug = "on-breaking-changes-in-transitive-dependencies"
date = 2022-12-05T10:06:32-05:00
publishDate = 2022-12-05T10:06:32-05:00
tags = ["ruby", "sidekiq"]
+++

Now and then you receive a report about something not working as expected. This time it was scarier than usual: a job, killed by Docker after consuming too much memory with an OOM error, was disappearing from the queue without a trace. In production, we deploy `sidekiq-pro` for its reliability guarantees, specifically `super_fetch` strategy for pulling work from the queue, and normally should re-queue the job after a restart.

<!--more-->

{{<toc>}}

## Why Sidekiq stopped recovering terminated jobs

Looking at the startup logs, I would normally expect `sidekiq-pro` to post messages about recovering jobs, like "SuperFetch recovered job:", but this is not happening even though the SuperFetch is being initialized:

```text
2022-10-27T10:19:41.187Z 1 TID-3lvl INFO: SuperFetch activated
2022-10-27T10:19:41.194Z 1 TID-3lx9 INFO: Gained leadership of the cluster
2022-10-27T10:19:41.194Z 1 TID-3m15 DEBUG: Tick: [2022-10-27 10:19:41.194801683 +0000]
2022-10-27T10:19:41.199Z 1 TID-3m3d DEBUG: SuperFetch: Registering super process <IDENTITY> with ["queue:sq|<IDENTITY>|critical"]
```

Something is not working as expected. Let's dig into how `super_fetch` works, and where exactly it breaks.

### How `super_fetch` recovers jobs

The inner workings of `super_fetch` are covered by the blog post ["Increase reliability using `super_fetch` of Sidekiq Pro"](https://www.bigbinary.com/blog/increase-reliability-of-background-job-processing-using-super_fetch-of-sidekiq-pro#sidekiq-pro-s-super-fetch). In short, it is a pretty clever usage of `RPOPLPUSH` Redis command: when Sidekiq picks a job from the queue, it also atomically pushes it into a private queue, created specifically for the current worker. If the process abnormally crashes, it is now possible to recover the jobs that otherwise would have been lost, and put them back into the original queue for processing.

The recovery mechanism depends on the heartbeat monitor to ignore live processes. This is what the flow looks like:

{{< figure lightsrc="sidekiq-pro-super_fetch-light.svg" darksrc="sidekiq-pro-super_fetch-dark.svg" caption="Sidekiq's `super_fetch` recovery flow" >}}

1. On startup, the newly spawned worker goes through the list of all registered in Redis super processes (`super_processes` set), skipping the ones that are still alive (based on heartbeat monitoring)
2. If the "dead" process is found, its private queues will be picked up for analysis (one private queue per real queue, which looks like `queue:sq|identity|queue_name`)
3. The jobs from the private queues get moved back to the original queues, and then private queues get deleted, along with the record in the `super_processes` set.

### Sidekiq heartbeat implementation

Now, imagine a scenario where the detection of which process is alive, is broken.

The heartbeat process uses a very simple, yet powerful technique. Every 5 seconds a thread would run, dumping stats for every worker in the process, and then the heartbeat metrics are saved into the "identity" key (which usually includes hostname, process PID, and some random string), with an expiration of 60 seconds. No heartbeat — Redis will delete the key after 60 seconds, and the process is officially dead.

To check if the process is alive, we just need to check if the key exists. Easy. Except it is not if you face a backward-incompatible change in the client library. What if "check if the key exists" would suddenly start always returning `true` (or, as we Rubyists often call it, `0`)? Well, the `super_fetch` job recover flow will go haywire for one.

### Backwards incompatible Redis client update

Historically, [redis-rb](https://github.com/redis/redis-rb) was converting the result of the [EXISTS](https://redis.io/commands/exists/) operation to a boolean (where `0` means `false`, and anything else is `true`). Then in 4.2.0, a [change was made](https://github.com/redis/redis-rb/commit/325752764995b02f17c3e5240ea489f641911d7d) that would allow passing multiple keys, and switched the return value to an integer, but only if `Redis.exists_returns_integer` is explicitly enabled. It turns out, this change produced a lot of noise in the logs, so it was [toned down](https://github.com/redis/redis-rb/pull/920) in 4.2.1 when the configuration option is explicitly set to `false`.

Sidekiq picked up the change [right away](https://github.com/mperham/sidekiq/issues/4591) in record time frame, releasing version 6.1.0, switching from using `conn.exists` to `conn.exists?`. Corresponding changes were also released for `sidekiq-pro` gem.

At some point a year later, [Akihide Ito noticed](https://github.com/redis/redis-rb/pull/1030) the promise to switch the default behavior in 4.3.0, while the Redis client version was already on 4.4.0. A [change was made](https://github.com/redis/redis-rb/pull/1030/commits/915d118cb9a2f7d507f0afa0fe8dedf3d28a9f63) for the upcoming 4.5.0 that switched default behavior, and consequently [made it more explicit](https://github.com/redis/redis-rb/commit/cf7e6287d49d3b1e89a647703946bff5439c36c4) to reduce logging noise.

What happened to us? Well, we upgraded the base `sidekiq` gem, `redis` client, but not `sidekiq-pro`. And after that, `super_fetch` stopped working.

```ruby
# sidekiq-pro 5.0.1
next if conn.exists(x)

# sidekiq-pro 5.1.0
next if conn.exists?(x)
```

Since `redis-rb` now always returns an integer, `sidekiq-pro` is thinking that all processes are alive, and skips job recovery. This is the most devastating impact of a question mark in history (yes, I exaggerate a little bit for the dramatic effect).

### Fixing the issue and recovering the jobs

Luckily for us, the private queues stayed intact in Redis, and all we need to do was to update `sidekiq-pro` to a more recent version and restart the process. We will need to go through the jobs that got stuck in the private queues to ensure they are still relevant and will not cause issues if ran today (normally, background jobs should be idempotent, but, for example, notifying a customer about an event that has already finished would be undesired.)

## Dependency management responsibilities

Who is responsible for managing dependencies in our applications? The obvious answer is — we are. It gets into a grey area with transitive dependencies thought. If a direct dependency (for example, Sidekiq), brings a 3rd-party transitive dependency, I would guess Sidekiq should properly specify the version requirements to make sure the versions are compatible.

On the other hand, gems cannot be too strict with version locks. If a gem locks version requirements to a specific version, or a list of versions below a specific minor or patch version,— that would require maintainers to quickly react to any version updates, re-test, and release new versions of their software with updated dependencies. This sounds horrible: an unnecessary burden on maintainers, frequent updates for no reason other than dependency version bumps, etc.

This is why standards like [Semantic Versioning](https://semver.org/) are so important. Imagine a world where software could be tested against a version of the dependency, and then allow all version updates as long as they are minor (a new functionality added in a backward-compatible manner) or patch versions (backward-compatible bug fixes). Well, luckily for us, Ruby programmers, the future is here. Almost all popular gems follow semantic versioning and allow _almost_ frictionless updates.

There are, of course, exceptions. The aforementioned Redis client gem [does not claim to follow semver](https://github.com/redis/redis-rb/issues/698#issuecomment-642477593):

> Semver is not gospel, and `redis-rb` doesn't claim to follow semver anyway. That change is absolutely trivial to handle, and it will be a while before the behavior change. It doesn't require a major version bump.
> **Jean Boussier**

Yes, on one hand, we tend to look for a silver bullet, and often make it into a religion. But I would sign for the initiative to make dependency management less fragile, and allow developers to update more often with reduced risk of introducing subtle and hard-to-catch bugs any day.

## Wrapping up

I don't know if Sidekiq maintainers could have handled this change better. After all, it is their software that does not work properly with an updated minor version of the Redis client library. On the other hand, introducing a breaking change in a minor library is a huge problem in any dependency management. I wonder if releasing a patch version of `sidekiq-pro`, locking the Redis client to the last known working version would be too much to ask. If you are a maintainer of an open-source library, please consider following semantic versioning, as this will make the lives of your users much simpler.
