#!/usr/bin/env ruby

io = ARGV[0] == "stderr" ? STDERR : STDOUT

printed_bytes = 0
loop do
  printed_bytes += io.write(".")
  File.write("#{__dir__}/printed_bytes.txt", printed_bytes.to_s)
end
