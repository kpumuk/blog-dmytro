#!/usr/bin/env -S gnuplot -c

postdir="../../content/posts/20221103102922-on-nginx-client-headers-parsing"

set terminal svg size 800,320 fname "Gill Sans" fontscale 1.5 rounded dashed
set datafile separator ','

# Line style for axes
set style line 80 lt 0
set style line 80 lt rgb "#808080"

# Line style for grid
set style line 81 lt 3  # dashed
set style line 81 lt rgb "#808080" lw 0.5  # grey

set grid back linestyle 81
unset xtics
set xtics format " "
set xtics ("a" 1100000)

set border 3 back linestyle 80 # Remove border on top and right.  These
             # borders are useless and make it harder
             # to see plotted lines near the border.
    # Also, put it in grey; no need for so much emphasis on a border.
set xtics nomirror
set ytics nomirror

# Credit: Christoph @ https://stackoverflow.com/a/52822256/204205
resolveUnit(s)=(pos=strstrt("kmgtp",s[strlen(s):*]), real(s)*(1024**pos))

set style line 1 lt 1
set style line 2 lt 1
set style line 3 lt 1
set style line 4 lt 1

set xrange [0:]
set yrange [0:]

#-------------------------------------------------------------------------------
# Memory
#-------------------------------------------------------------------------------

set ytics 10485760
set format y '%.1s%cB'

# Light scheme

# https://yeun.github.io/open-color/
set key textcolor "#445566"
set style line 1 lt rgb "#c92a2a" lw 2 pt 7 # Red - 9
set style line 2 lt rgb "#5c940d" lw 2 pt 9 # Lime - 9
set style line 3 lt rgb "#364fc7" lw 2 pt 5 # Indigo - 9
set style line 4 lt rgb "#d9480f" lw 2 pt 13 # Orange - 9

set output postdir."/nginx-memory-small-headers-light.svg"
set key bottom right

plot "data/1-nginx-sm-buffer-sm.csv" using 1:(resolveUnit(stringcolumn(5))) with lines title "client\\\_header\\\_buffer\\\_size=1k" linestyle 1, \
     "data/2-nginx-sm-buffer-lg.csv" using 1:(resolveUnit(stringcolumn(5))) with lines title "client\\\_header\\\_buffer\\\_size=10k" linestyle 2, \
     "data/3-nginx-sm-buffer-hg.csv" using 1:(resolveUnit(stringcolumn(5))) with lines title "client\\\_header\\\_buffer\\\_size=128k" linestyle 3

set output postdir."/nginx-memory-large-headers-light.svg"
set key center right

plot "data/4-nginx-sm-buffer-sm.csv" using 1:(resolveUnit(stringcolumn(5))) with lines title "client\\\_header\\\_buffer\\\_size=1k" linestyle 1, \
     "data/5-nginx-sm-buffer-lg.csv" using 1:(resolveUnit(stringcolumn(5))) with lines title "client\\\_header\\\_buffer\\\_size=10k" linestyle 2, \
     "data/6-nginx-sm-buffer-hg.csv" using 1:(resolveUnit(stringcolumn(5))) with lines title "client\\\_header\\\_buffer\\\_size=128k" linestyle 3

set output postdir."/nginx-memory-huge-headers-light.svg"
set key bottom right

plot "data/4-nginx-sm-buffer-sm.csv" using 1:(resolveUnit(stringcolumn(5))) with lines title "client\\\_header\\\_buffer\\\_size=1k" linestyle 1, \
     "data/7-nginx-lg-buffer.csv" using 1:(resolveUnit(stringcolumn(5))) with lines title "large\\\_client\\\_header\\\_buffers=4 16k" linestyle 2

# Dark scheme

# https://yeun.github.io/open-color/
set key textcolor "#fffef8"
set style line 1 lt rgb "#fa5252" lw 2 pt 7 # Red 6
set style line 2 lt rgb "#82c91e" lw 2 pt 9 # Lime 6
set style line 3 lt rgb "#4c6ef5" lw 2 pt 5 # Indigo 6
set style line 4 lt rgb "#fd7e14" lw 2 pt 13 # Orange 6

set output postdir."/nginx-memory-small-headers-dark.svg"
set key bottom right

plot "data/1-nginx-sm-buffer-sm.csv" using 1:(resolveUnit(stringcolumn(5))) with lines title "client\\\_header\\\_buffer\\\_size=1k" linestyle 1, \
     "data/2-nginx-sm-buffer-lg.csv" using 1:(resolveUnit(stringcolumn(5))) with lines title "client\\\_header\\\_buffer\\\_size=10k" linestyle 2, \
     "data/3-nginx-sm-buffer-hg.csv" using 1:(resolveUnit(stringcolumn(5))) with lines title "client\\\_header\\\_buffer\\\_size=128k" linestyle 3

set output postdir."/nginx-memory-large-headers-dark.svg"
set key center right

plot "data/4-nginx-sm-buffer-sm.csv" using 1:(resolveUnit(stringcolumn(5))) with lines title "client\\\_header\\\_buffer\\\_size=1k" linestyle 1, \
     "data/5-nginx-sm-buffer-lg.csv" using 1:(resolveUnit(stringcolumn(5))) with lines title "client\\\_header\\\_buffer\\\_size=10k" linestyle 2, \
     "data/6-nginx-sm-buffer-hg.csv" using 1:(resolveUnit(stringcolumn(5))) with lines title "client\\\_header\\\_buffer\\\_size=128k" linestyle 3

set output postdir."/nginx-memory-huge-headers-dark.svg"
set key bottom right

plot "data/4-nginx-sm-buffer-sm.csv" using 1:(resolveUnit(stringcolumn(5))) with lines title "client\\\_header\\\_buffer\\\_size=1k" linestyle 1, \
     "data/7-nginx-lg-buffer.csv" using 1:(resolveUnit(stringcolumn(5))) with lines title "large\\\_client\\\_header\\\_buffers=4 16k" linestyle 2

#-------------------------------------------------------------------------------
# CPU
#-------------------------------------------------------------------------------

set ytics 20
set format y '%.1s%%'
set key bottom right

# Light scheme

# https://yeun.github.io/open-color/
set key textcolor "#445566"
set style line 1 lt rgb "#c92a2a" lw 2 pt 7 # Red - 9
set style line 2 lt rgb "#5c940d" lw 2 pt 9 # Lime - 9
set style line 3 lt rgb "#364fc7" lw 2 pt 5 # Indigo - 9
set style line 4 lt rgb "#d9480f" lw 2 pt 13 # Orange - 9

set output postdir."/nginx-cpu-small-headers-light.svg"

plot "data/1-nginx-sm-buffer-sm.csv" using 1:(column(6)) with lines title "client\\\_header\\\_buffer\\\_size=1k" linestyle 1, \
     "data/2-nginx-sm-buffer-lg.csv" using 1:(column(6)) with lines title "client\\\_header\\\_buffer\\\_size=10k" linestyle 2, \
     "data/3-nginx-sm-buffer-hg.csv" using 1:(column(6)) with lines title "client\\\_header\\\_buffer\\\_size=128k" linestyle 3

set output postdir."/nginx-cpu-large-headers-light.svg"

plot "data/4-nginx-sm-buffer-sm.csv" using 1:(column(6)) with lines title "client\\\_header\\\_buffer\\\_size=1k" linestyle 1, \
     "data/5-nginx-sm-buffer-lg.csv" using 1:(column(6)) with lines title "client\\\_header\\\_buffer\\\_size=10k" linestyle 2, \
     "data/6-nginx-sm-buffer-hg.csv" using 1:(column(6)) with lines title "client\\\_header\\\_buffer\\\_size=128k" linestyle 3

set output postdir."/nginx-cpu-huge-headers-light.svg"

plot "data/4-nginx-sm-buffer-sm.csv" using 1:(column(6)) with lines title "client\\\_header\\\_buffer\\\_size=1k" linestyle 1, \
     "data/7-nginx-lg-buffer.csv" using 1:(column(6)) with lines title "large\\\_client\\\_header\\\_buffers=4 16k" linestyle 2

# Dark scheme

# https://yeun.github.io/open-color/
set key textcolor "#fffef8"
set style line 1 lt rgb "#fa5252" lw 2 pt 7 # Red 6
set style line 2 lt rgb "#82c91e" lw 2 pt 9 # Lime 6
set style line 3 lt rgb "#4c6ef5" lw 2 pt 5 # Indigo 6
set style line 4 lt rgb "#fd7e14" lw 2 pt 13 # Orange 6

set output postdir."/nginx-cpu-small-headers-dark.svg"

plot "data/1-nginx-sm-buffer-sm.csv" using 1:(column(6)) with lines title "client\\\_header\\\_buffer\\\_size=1k" linestyle 1, \
     "data/2-nginx-sm-buffer-lg.csv" using 1:(column(6)) with lines title "client\\\_header\\\_buffer\\\_size=10k" linestyle 2, \
     "data/3-nginx-sm-buffer-hg.csv" using 1:(column(6)) with lines title "client\\\_header\\\_buffer\\\_size=128k" linestyle 3

set output postdir."/nginx-cpu-large-headers-dark.svg"

plot "data/4-nginx-sm-buffer-sm.csv" using 1:(column(6)) with lines title "client\\\_header\\\_buffer\\\_size=1k" linestyle 1, \
     "data/5-nginx-sm-buffer-lg.csv" using 1:(column(6)) with lines title "client\\\_header\\\_buffer\\\_size=10k" linestyle 2, \
     "data/6-nginx-sm-buffer-hg.csv" using 1:(column(6)) with lines title "client\\\_header\\\_buffer\\\_size=128k" linestyle 3

set output postdir."/nginx-cpu-huge-headers-dark.svg"

plot "data/4-nginx-sm-buffer-sm.csv" using 1:(column(6)) with lines title "client\\\_header\\\_buffer\\\_size=1k" linestyle 1, \
     "data/7-nginx-lg-buffer.csv" using 1:(column(6)) with lines title "large\\\_client\\\_header\\\_buffers=4 16k" linestyle 2
