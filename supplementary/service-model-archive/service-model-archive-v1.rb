#!/usr/bin/env ruby

require "bundler/inline"

gemfile do
  source "https://rubygems.org"

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
  raise "Failed to download a gem for archival: #{spec.full_name}" unless response.success?

  response.body
end

data = [File.read(__FILE__)]
sorted_data = nil

Benchmark.bm do |x|
  x.report("download:") do
    Gem::Specification.each do |spec|
      data << download_gem(spec.full_name)
    end
  end

  x.report("    sort:") do
    sorted_data = data.join
      .unpack("B*")               # take bits
      .map { _1.chars.sort.join } # sort them bits
      .pack("B*")                 # pack to bytes
  end
end

puts <<~MSG
  \nResults:
      Original: #{data.sum { _1.size }} bytes in #{data.count} pieces
        Sorted: #{sorted_data.size} bytes
      Archived: #{Zlib.deflate(sorted_data).size} bytes
           25%: #{sorted_data[(sorted_data.size * 0.25).to_i].unpack("B*").first}
           75%: #{sorted_data[(sorted_data.size * 0.75).to_i].unpack("B*").first}
MSG
