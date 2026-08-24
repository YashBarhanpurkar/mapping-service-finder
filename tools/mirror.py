#!/usr/bin/env python3
"""Regenerate JS mirrors of the canonical JSON data (needed for file:// use).
Run from demonstrator_web/:  python3 tools/mirror.py"""
import json
for src, var, dst in [("data/vocabularies.json","__VOCAB__","data/vocabularies.js"),
                      ("data/providers.json","__PROVIDERS__","data/providers.js")]:
    d=json.load(open(src))
    open(dst,"w",encoding="utf-8").write(f"/* AUTO-GENERATED from {src} — do not edit; regenerate with tools/mirror.py */\nwindow.{var} = " + json.dumps(d, ensure_ascii=False) + ";\n")
print("mirrors regenerated")
