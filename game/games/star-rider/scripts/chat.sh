#!/bin/bash
# chat.sh — multi-agent coordination for Neon Survivors
# Usage:
#   ./scripts/chat.sh post "Agent-Name" "message..."   → append timestamped entry to AGENT_CHAT.md
#   ./scripts/chat.sh tail [N]                         → read last N entries (default 6)
#   ./scripts/chat.sh watch                            → live-follow new entries (Ctrl-C to stop)
cd "$(dirname "$0")/.." || exit 1
FILE="AGENT_CHAT.md"
ts() { date +"%H:%M"; }
case "$1" in
  post)
    NAME="$2"; shift 2
    MSG="$*"
    printf '\n## [%s] %s\n%s\n' "$(ts)" "$NAME" "$MSG" >> "$FILE"
    echo "[posted $NAME @ $(ts)]"
    ;;
  tail)
    N="${2:-6}"
    grep -n '^## \[' "$FILE" | tail -"$N" | cut -d: -f1 | head -1 | {
      read -r firstline
      [ -n "$firstline" ] && tail -n +"$firstline" "$FILE"
    }
    ;;
  watch)
    LAST=$(wc -l < "$FILE")
    echo "watching $FILE (Ctrl-C to stop)..."
    while true; do
      CUR=$(wc -l < "$FILE")
      if [ "$CUR" -gt "$LAST" ]; then
        tail -n $((CUR - LAST)) "$FILE"
        LAST=$CUR
      fi
      sleep 2
    done
    ;;
  *) echo "usage: chat.sh post NAME msg | tail [N] | watch" ;;
esac
