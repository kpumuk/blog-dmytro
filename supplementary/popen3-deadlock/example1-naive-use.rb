#!/usr/bin/env ruby

require "open3"

Open3.popen3("ls") do |stdin, stdout, stderr, wait_thr|
  stdin.close

  puts "===> STDOUT:", stdout.read
  puts "===> STDERR:", stderr.read
end
