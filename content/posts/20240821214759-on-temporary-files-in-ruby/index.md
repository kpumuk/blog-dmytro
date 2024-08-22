+++
title = "On temporary files in Ruby"
subtitle = "how not to shoot yourself in the foot"
slug = "on-temporary-files-in-ruby"
date = 2024-08-21T21:48:01-04:00
publishDate = 2024-08-21T21:48:01-04:00
tags = ["ruby"]
+++

We often use temporary files when building software: to store a report before sending it to a customer or uploading it to AWS S3; to download a CSV to parse into a database; or to store a picture of your beloved cat before sending it to the generative AI to put a silly hat on the unsuspecting feline. Today, I will talk about common mistakes with temporary files.

<!--more-->

{{<toc>}}

## Using the file after disposing of the `Tempfile` object

Let's take a look at the following example:

```ruby
def generate_report(rows)
  tempfile = Tempfile.new("report")
  CSV.new(tempfile, write_headers: true, headers: ["ID", "Name"]) do |csv|
    rows.each { csv << [_1.id, _1.name] }
  end
  tempfile.path
end

# Somewhere else
path = generate_report(users)
s3_bucket.object("report.csv").upload_file(path)
```

The code passes QA, your tests are green, and you ship it to production. Then, the next day, you get an error in Sentry:

```plain
No such file or directory @ rb_sysopen - /var/folders/cg/nr4lp6j52tz30sthgzsvfmq00000gn/T/report20240821-56738-8pw09p (Errno::ENOENT)
```

Why is this happening? Because of the lifecycle of the `Tempfile` object. When a normal file is created, written to, and then closed, the file persists on the disk. A temporary file, on the other hand, not only gets a unique name in a special place on the disk but is also automatically deleted (in most cases); the only question is when this happens:

- When the `Tempfile` object that defines finalizers is garbage collected.
- When a block form of `Tempfile.create` is used to open the temporary file.
- An explicit `unlink` removes the file from the file system. Interestingly, on POSIX systems, the file can be `unlinked` before closing, which would remove the filesystem entry but keep the file handle open; this will ensure that the only processes accessing the file are those that already have it open.

Let's consider the first scenario:

```ruby
# Create a temporary file in a proc
path = -> { Tempfile.new.path }.call
# Start garbage collector
GC.start
# Let's try to read the file
File.read(path)
# => Errno::ENOENT
```

What about the block form?

```ruby
path = Tempfile.create { |tempfile| tempfile.path }
File.read(path)
# => Errno::ENOENT
```

As expected, in the end of the block the file object is closed and the underlying file is removed.

And the most "wordy" and error-prone version of the `Tempfile` usage:

```ruby
file = Tempfile.new
begin
   # ...do something with file...
ensure
   file.close
   file.unlink # delete the temporary file
end
```

Alright, with all this knowledge, let's refactor the first example to no longer randomly break in production:

```ruby
def generate_report(tempfile, rows)
  CSV.new(tempfile, write_headers: true, headers: ["ID", "Name"]) do |csv|
    rows.each { csv << [_1.id, _1.name] }
  end
end

def with_temporary_file(name, &block)
  Tempfile.create(name, &block)
end

# Somewhere else
with_temporary_file("report") do |tempfile|
  generate_report(tempfile, users)
  s3_bucket.object("report.csv").upload_file(tempfile.path)
end
```

With this change, we ensure that:

- The temporary file is deleted as soon as we no longer need it.
- The file stays on the file system for as long as we need it.

### Garbage collection on `Tempfile` objects

I mentioned that the file is almost always deleted, and that it depends on whether the finalizers were defined. How do you know if that is the case? Actually, it is pretty simple:

- `Tempfile.new` and `Tempfile.open` define finalizers that will automatically close and unlink the file.
- `Tempfile.open` with a block will close the file at the end of the block.
- `Tempfile.create` **does not define** finalizers but will close and unlink the file in block form.

This means that `Tempfile.create` is the most efficient API for temporary files (no delegation, no finalizers), and the only API to keep the temporary file on disk.

If you really, really need a temporary file that will not be garbage collected, and which you will manually track and delete when it is no longer needed, use `Tempfile.create` without a block. Returning to our first example,

```ruby
def generate_report(rows)
  tempfile = Tempfile.create("report")
  CSV.new(tempfile, write_headers: true, headers: ["ID", "Name"]) do |csv|
    rows.each { csv << [_1.id, _1.name] }
  end
  tempfile.path
ensure
  # manually close to free the file descriptor
  tempfile.close
end

# Somewhere else
path = generate_report(users)
s3_bucket.object("report.csv").upload_file(path)
# It is important to not forget to delete the file
File.unlink(path)
```

With this change, we have to manually close the temporary file to free the file descriptor and manually unlink the file to free the disk space. That's a lot of responsibility to carry, and I would recommend avoiding it at all costs. Even if you can do it, it does not mean you should.

## Using `Tempfile.open` instead of `Tempfile.create`

`Tempfile.create` is the recommended interface when working with temporary files in Ruby. It avoids multiple pitfalls that exist in both `Tempfile.new` and `Tempfile.open`:

- Avoids the performance cost of delegation incurred when `Tempfile.new` calls its superclass `DelegateClass(File)`.
- Does not rely on a finalizer to close and unlink the file, which can be unreliable.
- Ensures the file is unlinked at the end of the block.

The Ruby documentation says the following:

> `Tempfile.open` is still appropriate if you need the `Tempfile` to be unlinked by a finalizer and you cannot explicitly know where in the program the `Tempfile` can be unlinked safely.

When there is no block given, `Tempfile.open` just proxies the call to `Tempfile.new`, so it's better just to use the latter instead. On the other hand, when called with a block, it ensures the file handle is closed (but does not unlink the file, relying on a finalizer and GC to unlink it). This means we cannot know when the file will be deleted unless GC is disabled and manually triggered because it can delete the file at any point in time, and it is simply not safe to use it!

**If you plan to use a file, hold on to the `Tempfile` instance until you no longer need it!**

## Re-opening the temporary file even if it is already open

When using `Tempfile`, Ruby not only creates a temporary file but also opens it in `w+` mode (read, write, positioned at the end). This means you can immediately start writing to it!

```ruby
# bad
Tempfile.create do |tempfile|
  CSV.open(tempfile.path) do |csv|
    csv << row
  end
end

# good
Tempfile.create do |tempfile|
  CSV.new(tempfile) do |csv|
    csv << row
  end
end
```

The difference is that in the first example we will have two file handles open in the process. On POSIX systems, the number of file descriptors any process can hold is limited (can be configured, but still limited). If we use two file descriptors for each of our temporary files, and it is a Sidekiq process with multiple concurrent workers generating our quarterly pay stubs — the process can (and will) run out of descriptors. It will look like this:

```ruby
300.times.map { Tempfile.new }
# => Too many open files @ rb_sysopen - /var/folders/cg/nr4lp6j52tz30sthgzsvfmq00000gn/T/20240822-60283-9a00gd (Errno::EMFILE)
```

The default soft limit for the number of open files is 256 on my OS X machine, and I simulated actual processes holding open files by storing them in an array. If we re-open the already open file and allocate a second descriptor, we will only be able to open half that number. Also, please note that descriptors are also used for sockets (database and Redis connections, incoming web requests for your Puma server, log file, even stdin, stdout, and stderr use them).

## Not closing the temporary file after use

We just talked about it. File descriptors are a precious resource, and we should handle them with care.

```ruby
# Bad: the file will not be closed and removed immediately
# after the use and relies on GC to clean it up
def generate_and_upload_report
  tempfile = Tempfile.new
  tempfile << "Hello"
  upload(tempfile)
end
```

This code depends on the garbage collector to both close and unlink the file. It will eventually happen, but on any system with a high load, the GC might not trigger fast enough, and you could run out of file descriptors or disk space.

## Not specifying a file name or extension

It is not necessary to specify any parameters when using `Tempfile`. The following code is perfectly valid and works amazingly well:

```ruby
Tempfile.create do |f|
  f << "Hello, world"
end
```

The downside is that if you are dealing with a production incident, for example, `Errno::ENOSPC: No space left on device`, you need all the help you can get. Looking at a directory that only has files like `20240822-60283-j8dbll` is not helpful at all!

Let's fix it:

```ruby
Tempfile.create(["user-report-#{Current.tenant_id}-", ".txt"]) do |f|
  f << "Hello, world"
end
```

Here, we passed an array of two strings, which Tempfile will use as a prefix and a suffix for the filename:

```
user-report-1234-20240822-60283-r7wsje.txt
```

It is much easier to see where the files are coming from, what their contents might be, and we can proceed with addressing the root cause of that pesky disk space problem.

## Wrapping up

To conclude, here is how I would recommend using the `Tempfile`:

```ruby
Tempfile.create(["report-", ".csv"]) do |tempfile|
  CSV.new(tempfile) do |csv|
    # ...
  end
end
```

If you don't want any other process to access your file, put `tempfile.unlink` as the first line in the block. Please note that you also will not be able to reopen the file after that.
