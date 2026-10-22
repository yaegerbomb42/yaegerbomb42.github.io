#!/bin/bash
# Sphere Quest — local launcher
# Starts a tiny HTTP server (needed for ES modules / CDN importmap) and opens the game.
cd "$(dirname "$0")"
PORT=8642
if ! curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$PORT/" >/dev/null 2>&1; then
  (setsid nohup python3 -m http.server "$PORT" --bind 127.0.0.1 >/tmp/sphere_server.log 2>&1 &)
  sleep 1
fi
open "http://127.0.0.1:$PORT/"
