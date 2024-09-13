#!/usr/bin/env ruby

require "open3"

Open3.popen3("ruby #{__dir__}/process.rb stderr") do |stdin, stdout, stderr, wait_thr|
  puts "===> STDOUT:", stdout.read
  puts "===> STDERR:", stderr.read
end
