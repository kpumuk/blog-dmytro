#!/usr/bin/env ruby

require "open3"

Open3.popen3("ruby #{__dir__}/process.rb stdout") do |stdin, stdout, stderr, wait_thr|
  puts "===> STDERR:", stderr.read
  puts "===> STDOUT:", stdout.read
end
