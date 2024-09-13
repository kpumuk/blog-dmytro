require "benchmark"
require "open3"

def popen3_threads(cmd, opts = {})
  Open3.popen3(*cmd, opts) do |i, o, e, t|
    out_reader = Thread.new { o.read }
    err_reader = Thread.new { e.read }
    i.close
    [out_reader.value, err_reader.value, t.value]
  end
end

def popen3_read_nonblock(cmd, opts = {})
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
end

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
