+++
title = "On dangers of Open3.popen3"
subtitle = "how to avoid deadlocks when reading from a process"
slug = "on-dangers-of-open3-popen3"
date = 2024-08-27T16:56:43-04:00
publishDate = 2024-09-12T22:58:05-04:00
tags = ["ruby"]
+++

Sometimes we need to run a child process and read its output: it could be ffmpeg to convert a video to another format or apply a watermark, or run pgdump to backup a database. When the process we are running is noisy, it often can lead to unexpected deadlocks, which is the point of this post.

<!--more-->

{{<toc>}}

## Background

I was reading an article about running system commands in Ruby, and this recommendation caught my eye:

> Spoiler: If you’re looking for a short answer on what to use in production for most cases, you can choose `Open3.popen3`.
>
> [9 Ways to Run System Commands in Ruby](https://kirillshevch.medium.com/9-ways-to-run-system-commands-in-ruby-d099223a0ec6) by _Kirill Shevchenko_

I would probably disagree with the advice and would prefer to use backticks to run a process and capture its output, and only use `Open3.popen3` when I need to separate stdout and stderr. In the article, Kirill says that this method does not provide access to the exit status, which is not true — the exit status is available via the `$?` global variable or the `Process.last_status` method:

```ruby
`ls /what`
# ls: /what: No such file or directory
$?
# => #<Process::Status: pid 40338 exit 1>
Process.last_status
# => #<Process::Status: pid 40338 exit 1>
```

Why would I not use `Open3.popen3` by default? Let's consider the simplest usage example.

## A very naive usage of `Open3.popen3`

The method yields stdin, stdout, stderr, and a wait thread to the block, so we can simply read from stdout and stderr.

```ruby
Open3.popen3("ls") do |stdin, stdout, stderr, wait_thr|
  puts "===> STDOUT:", stdout.read
  puts "===> STDERR:", stderr.read
end
```

As I mentioned before, in some cases when the process is chatty and generates a lot of output on one of the channels, a deadlock might occur. This happens because there is a buffer limit set on both of them, and once it is reached — the write operation will block, and the whole process will stall. If we're waiting to read on the second channel during that time, we will get a deadlock.

{{< figure lightsrc="open3-deadlock-light.svg" darksrc="open3-deadlock-dark.svg" caption="Deadlock when reading from from one channel at a time" >}}

In the example above, the child process is trying to write more data into stderr, but there is no more room left in the buffer. The parent process has read everything from stdout and is waiting for more data or until the child process exits, and the child is blocked trying to write to stderr — leading to a deadlock.

## Measuring the buffer size

How do we measure the size of the buffer? Let's write a script that writes byte by byte into a requested stream and saves the number of bytes written into a file, so that it can be checked outside of the deadlocked process.

```ruby
io = ARGV[0] == "stderr" ? STDERR : STDOUT

printed_bytes = 0
loop do
  printed_bytes += io.write(".")
  File.write("#{__dir__}/printed_bytes.txt", printed_bytes.to_s)
end
```

Let's call it

```ruby
# Print to stderr, but read from stdout first
Open3.popen3("ruby #{__dir__}/process.rb stderr") do |stdin, stdout, stderr, wait_thr|
  puts "===> STDOUT:", stdout.read
  puts "===> STDERR:", stderr.read
end
```

```ruby
# Print to stdout, but read from stderr first
Open3.popen3("ruby #{__dir__}/process.rb stdout") do |stdin, stdout, stderr, wait_thr|
  puts "===> STDERR:", stderr.read
  puts "===> STDOUT:", stdout.read
end
```

The results are interesting:

```plain
stdout: 73727
stderr: 65536
```

Surely, we can explain the second number: `65536` is 2^16^, and a limit one programmer could set. But `73727` is oddly specific yet does not look like anything at first glance.

### Buffered vs unbuffered output

Let's step back a little bit and talk about IO output. Writing to a physical storage device or a network socket is an expensive operation that usually requires a syscall. In order to minimize the number of those, especially in the cases when we print data byte by byte, like in our case, most IO abstractions implement buffering — the data is accumulated until a threshold is reached, and then flushed at the IO in bulk.

On POSIX systems, `stdout` is usually buffered so that the output to a terminal (or other applications via pipes) is efficient, whilst `stderr` is not buffered because error messages usually should be seen immediately. To confirm this, we can set the `sync` attribute on `STDOUT` to true:

```ruby
STDOUT.sync = true
```

If we re-run our script again, the output will be as expected: `65536`. Two questions immediately pop up:

- Who is responsible for buffering?
- The buffer size seems to be `8191`, which is 1 byte short of 2^13^ (`73727−65536`). Is there an off-by-one error somewhere? We know programmers love powers of `2`.

I will leave this mystery for another day, as it is not the point of this post. Just keep in mind that standard output is usually buffered.

## Solving the deadlock

> Take care to avoid deadlocks. Output streams stdout and stderr have fixed-size buffers, so reading extensively from one but not the other can cause a deadlock when the unread buffer fills. To avoid that, stdout and stderr should be read simultaneously (using threads or `IO.select`).
>
> [`Open3.popen3` — Ruby 3.3 Documentation](https://docs.ruby-lang.org/en/3.3/Open3.html#method-i-popen3)

With this recommendation in mind, let's build a solution.

### Simultaneously reading from multiple inputs using threads

This is basically what `Open3.capture3` does under the hood:

```ruby
Open3.popen3(*cmd, opts) do |i, o, e, t|
  out_reader = Thread.new { o.read }
  err_reader = Thread.new { e.read }
  i.close
  [out_reader.value, err_reader.value, t.value]
end
```

The code creates 2 threads, each reads a corresponding output stream. Then it calls `value` on each thread, which waits for the thread to complete using `join`, and returns the value.

### Peek at IO buffers for available with `IO.select` and `read_nonblock`

This approach is harder to implement and depends on non-blocking reads and waiting for data to become available on one of the input streams:

```ruby
Open3.popen3(*cmd, opts) do |i, o, e, t|
  i.close
  readables = [o, e]
  stdout = []
  stderr = []
  while !readables.empty?
    readable, = IO.select(readables)
    if readable.include?(o)
      begin
        stdout << o.read_nonblock(4096)
      rescue EOFError
        readables.delete(o)
      end
    end
    if readable.include?(e)
      begin
        stderr << e.read_nonblock(4096)
      rescue EOFError
        readables.delete(e)
      end
    end
  end
  [stdout.join, stderr.join, t.value]
end
```

Here we wait for data to appear in any of the streams and then read from them in chunks of up to 4096 bytes at a time. Once the stream reaches the end, an `EOFError` is thrown, at which point we stop selecting the corresponding stream.

### Benchmarking our solutions

For benchmarking, we will use a simple script that writes to `stdout` and `stderr` in parallel as fast as it can. It will write 1 GB of data to each stream in chunks of 4096 bytes. The script under test will read the data from the streams and perform the same way as `Open3.capture3` does. We also disabled garbage collection to avoid any interference with the benchmark (I am testing on a machine with 64 GB of memory, so we should be able to avoid swapping memory).

First, let's generate output:

```ruby
BUFFER_SIZE = 4096
OUTPUT_SIZE = 1024 * 1024 * 1024
BUFFER = "." * BUFFER_SIZE

[$stdout, $stderr].map do |io|
  Thread.new do
    (OUTPUT_SIZE / BUFFER_SIZE).times { io.write(BUFFER) }
  end
end.each(&:join)
```

Benchmarking code:

```ruby
GC.disable

Benchmark.bm(15) do |x|
  x.report("threads:") do
    popen3_threads("ruby ./generate.rb")
  end

  x.report("read_nonblock:") do
    popen3_read_nonblock("ruby ./generate.rb")
  end

  x.report("capture3:") do
    Open3.capture3("ruby ./generate.rb")
  end
end
```

And the results:

```text
                      user     system      total        real
threads:          1.901313   6.175841  11.698678 (  7.566762)
read_nonblock:    0.831525   0.947956   2.829181 (  1.867949)
capture3:         1.875691   6.337733  11.828619 (  7.700172)
```

Non-blocking reading is the definitive winner here, but the code is significantly harder to write. How often do you read 1 GB from stdout/stderr?

## Conclusion

Inter-process communication is hard, and we should be extra careful when dealing with it. It was a fun exploration for me writing this post, but when I hit a deadlock in production running ffmpeg on a corrupted video file, or a stalled MySQL backup caused by excessive stderr output, those memories will haunt me till the end of my days. Remember to read simultaneously from both inputs, and you might never see this problem in your programs.

Scripts used in this benchmark are available in the [blog repository](https://github.com/kpumuk/blog-dmytro/tree/main/supplementary/popen3-deadlock/).

## Change history

- **2024-09-17** — Added a diagram for the conditions leading to a deadlock when reading from one channel at a time.
