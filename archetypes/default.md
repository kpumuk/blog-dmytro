+++
title = "{{ replace .Name "-" " " | title }}"
subtitle = ""
slug = "{{ .TranslationBaseName | replaceRE "^[0-9]{14}-" ""  }}"
date = {{ .Date }}
publishDate = {{ .Date }}
tags = []
draft = true
+++

Short summary.

<!--more-->

Post contents.
