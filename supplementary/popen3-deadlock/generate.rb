BUFFER_SIZE = 4096
OUTPUT_SIZE = 1024 * 1024 * 1024
BUFFER = "." * BUFFER_SIZE

[$stdout, $stderr].map do |io|
  Thread.new do
    (OUTPUT_SIZE / BUFFER_SIZE).times { io.write(BUFFER) }
  end
end.each(&:join)
