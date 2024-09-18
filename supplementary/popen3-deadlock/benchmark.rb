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
    until readables.empty?
      readable, = IO.select(readables)

      stdout << o.read_nonblock(4096, exception: false) if readable.include?(o)
      stderr << e.read_nonblock(4096, exception: false) if readable.include?(e)
      readables.reject!(&:eof?)
    end
    [stdout.join, stderr.join, t.value]
  end
end

GC.disable

Benchmark.bm(15) do |x|
  x.report("threads:") do
    popen3_threads("ruby #{__dir__}/generate.rb")
  end

  x.report("read_nonblock:") do
    popen3_read_nonblock("ruby #{__dir__}/generate.rb")
  end

  x.report("capture3:") do
    Open3.capture3("ruby #{__dir__}/generate.rb")
  end
end
