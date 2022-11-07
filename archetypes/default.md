+++
title = "{{ replace .Name "-" " " | title }}"
subtitle = ""
slug = "{{ .TranslationBaseName | replaceRE "^[0-9]{14}-" ""  }}"
date = {{ .Date }}
tags = []
draft = true
+++

Short summary.

<!--more-->

Post contents.
