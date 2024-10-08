#!/usr/bin/env ruby

require "bundler/inline"

gemfile do
  source "https://rubygems.org"

  gem "async", require: ["async", "async/barrier", "async/semaphore"]
  gem "benchmark"
  gem "faraday"
  gem "zlib"
end

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
sorted = nil

Benchmark.bm do |x|
  x.report("download:") do
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
  end

  x.report("    sort:") do
    sorted = data.join
      .unpack("B*")               # take bits
      .map { _1.chars.sort.join } # sort them bits
      .pack("B*")                 # pack to bytes
  end
end

puts <<~MSG
  \nResults:
      Original: #{data.sum { _1.size }} bytes in #{data.count} pieces
        Sorted: #{sorted.size} bytes
      Archived: #{Zlib.deflate(sorted).size} bytes
           25%: #{sorted[(sorted.size * 0.25).to_i].unpack("B*").first}
           75%: #{sorted[(sorted.size * 0.75).to_i].unpack("B*").first}
MSG
