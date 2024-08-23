+++
title = "On \"Service Model\""
subtitle = "helping librarians to preserve data"
slug = "on-service-model"
date = 2024-06-26T17:17:08-04:00
publishDate = 2024-08-23T17:17:28-04:00
tags = ["humor", "ruby", "books"]
+++

While reading "Service Model", a book by Adrian Tchaikovsky, I was first fascinated by the librarians, and then later awestruck by the elegance and silliness of their idea. This post will explore a potential implementation of the algorithm, a little bit of exploration of Async in Ruby, and some spoilers for that part of the book. You have been warned.

<!--more-->

{{<toc>}}

{{< figure src="9781250290281.jpg" alt="Old blog design preview" class="aside" >}}

> “All human knowledge,” the Chief Librarian declaimed, “retrieved from the fallen world outside by our gallant librarians, restored, decoded, and read in the First Hall. Rendered into a common binary code, then placed before the copyists, who translate it into our secure system here. Our master server, which catalogues and files each individual bit of information, to be stored in order within our archive for ease of cross-reference and retrieval. Is this not the greatest endeavor of all human history?”
>
> _[Service Model](https://www.goodreads.com/book/show/195790861-service-model)_ by Adrian Tchaikovsky

## What exactly are we building?

To understand the main idea, we have to read a bit further. In the book, librarians went out into the world to collect material they wanted to preserve (which is all digital knowledge). They brought it back to the library, where it was loaded or read in the First Hall on computers not connected to the internal network to ensure the archive's safety. It was then copied by copyists from the monitor into a secure system, where it was sorted in the most literal sense of that word: all the bits were sorted in order before being stored in the archive. And here is the main idea why doing that:

> Instead, we determined that if we filed all our data in this universal manner, then the Library could become more than the sum of the information placed within it. Our Archive not only preserves all the learning that we have encoded into it. Because our zeroes and ones may be retrieved in any order, rather than simply that of the original documents, it contains all possible knowledge! We here preserve every conceivable book, manual, tract, recording, and program that could ever have been created, not merely all those that were. We are the greatest repository of potential knowledge in the history of history itself.

Let's help the librarians and write a script that archives itself along with all necessary dependencies so that we can restore it in case of a disaster. Here is the plan:

1. We will write a single-file script.
2. It will declare all necessary dependencies as an inline bundle.
3. It will archive its own source and the binary versions of all dependencies.
4. The main character in the book asked to see data at 25% and 75% of the archive, so we will do the same.

## Implementing archiver v1, single-threaded

We will start by declaring the necessary dependencies. We will use Bundler to manage them, `benchmark` to measure steps (after all, we want the best performance!), `faraday` to abstract the HTTP client, and `zlib` for giggles — just to see how well our pure archive compresses.

```ruby
require "bundler/inline"

gemfile do
  source "https://rubygems.org"

  gem "benchmark"
  gem "faraday"
  gem "zlib"
end
```

Reading our own source is as simple as `File.read(__FILE__)`. We can enumerate all loaded dependencies via `Gem::Specification`, and then download them from https://rubygems.org via API:

```ruby
def download_gem(name)
  response = Faraday.get(
    "https://rubygems.org/downloads/#{name}.gem",
    {},
    user_agent: "ServiceModel-Librarian/1.0"
  )
  raise "Failed to download: #{spec.full_name}" unless response.success?

  response.body
end

data = [File.read(__FILE__)]

Gem::Specification.each do |spec|
  data << download_gem(spec.full_name)
end
```

So far, pretty straightforward. Let's sort the data into the archive! We will need to sort the bits, so it is crucial to extract them from the data. We can use `pack` and `unpack` with the `B` modifier:

```ruby
"hello".unpack("B*")
# => ["0110100001100101011011000110110001101111"]
["0110100001100101011011000110110001101111"].pack("B*")
# => "hello"
```

All we need to do now is to sort those bits:

```ruby
"01101000".chars.sort.join
# => "00000111"
```

The full sorting algorithm looks like this:

```ruby
sorted = data.join
  .unpack("B*")               # take bits
  .map { _1.chars.sort.join } # sort them bits
  .pack("B*")                 # pack into bytes
```

Let's put it all together and add some benchmarking:

```ruby
{{% include "supplementary/service-model-archive/service-model-archive-v1.rb" %}}
```

Here is what we see when the script is run:

```
$ ruby service-model-archive-v1.rb
               user     system      total        real
download:  0.021359   0.010195   0.031554 (  0.296913)
    sort:  0.562677   0.110775   0.673452 (  0.706862)

Results:
    Original: 674458 bytes in 9 pieces
      Sorted: 674458 bytes
    Archived: 679 bytes
         25%: 00000000
         75%: 11111111
```

The script works, but it does not scale too well, and does not model what is happening in the book too well. There were multiple librarians collecting materials in the world, and in our case, only a single thread is downloading the dependencies. Let's fix that.

## Implementing archiver v2, async fibers

We will parallelize the collection using the amazing [async](https://github.com/socketry/async) gem. The simplest solution would be to spawn a fiber for each dependency:

```ruby
Sync do |parent|
  gems = Gem::Specification.map do |spec|
    parent.async do
      download_gem(spec.full_name)
    end
  end.map(&:wait)
  data.concat(gems)
end
```

This works perfectly fine, but the more dependencies we have, the more fibers will spawn and more network connections will open. Normally, we do not want an unbounded number of tasks spawned. To introduce a limit, we can use the `Async::Semaphore` primitive:

```ruby
Sync do
  semaphore = Async::Semaphore.new(10)

  gems = Gem::Specification.map do |spec|
    semaphore.async do
      download_gem(spec.full_name)
    end
  end.map(&:wait)
  data.concat(gems)
end
```

Waiting for the tasks to complete is pretty trivial: we just have to call `wait` on them in order. A more elegant solution is to use the `Async::Barrier` primitive:

```ruby
Sync do
  barrier = Async::Barrier.new
  semaphore = Async::Semaphore.new(10, parent: barrier)

  Gem::Specification.each do |spec|
    semaphore.async do
      data << download_gem(spec.full_name)
    end
  end

  barrier.wait
end
```

The full script:

```ruby
{{% include "supplementary/service-model-archive/service-model-archive-v2.rb" %}}
```

Let's see how it performs:

```plain
$ ruby service-model-archive-v2.rb
               user     system      total        real
download:  0.029931   0.009220   0.039151 (  0.160382)
    sort:  0.643403   0.164919   0.808322 (  0.845208)

Results:
    Original: 868246 bytes in 16 pieces
      Sorted: 868246 bytes
    Archived: 867 bytes
         25%: 00000000
         75%: 11111111
```

We have archived more data faster, which will definitely speed up our initiative to preserve all knowledge. Most of the time is still spent on sorting, which can theoretically be optimized simply by counting bits, but that was not the point of the article. To be fair, this article has no point, but I hope you had at least a fraction of the fun I had writing it (of which I had a lot).

> “Every bit of information duly filed, in order,” the Chief Librarian announced proudly. “An Archive perfect in its logical construction.”

You will have to [read the book](https://www.goodreads.com/book/show/195790861-service-model) to see how this plan plays out for them :)

The full source code can be found in the [blog repository](https://github.com/kpumuk/blog-dmytro/tree/main/supplementary/service-model-archive/).
