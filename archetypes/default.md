+++
title = "{{ replace (replaceRE "^[0-9]{14}-" "" .Name) "-" " " | title }}"
subtitle = ""
slug = "{{ .ContentBaseName | replaceRE "^[0-9]{14}-" "" }}"
date = {{ .Date }}
publishDate = {{ .Date }}
tags = []
draft = true
+++

Short summary.

<!--more-->

Post contents.
