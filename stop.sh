#!/bin/bash
# 一键停止 My Radio 前后端

ROOT="$(cd "$(dirname "$0")" && pwd)"

# 收集指定 PID 的所有子进程，确保 npm/tsx/vite 的父子链一起退出。
collect_children() {
  local parent="$1"
  local children
  children="$(pgrep -P "$parent" 2>/dev/null || true)"
  for child in $children; do
    echo "$child"
    collect_children "$child"
  done
}

# 清理当前项目的前后端开发进程。
collect_project_pids() {
  local pids=""
  local port_pids
  local project_pids

  port_pids="$(lsof -ti :15620 -ti :3000 2>/dev/null || true)"
  project_pids="$(pgrep -f "$ROOT/(server|web)" 2>/dev/null || true)"
  pids="$port_pids $project_pids"

  for pid in $port_pids $project_pids; do
    pids="$pids $(collect_children "$pid")"
  done

  echo "$pids" | tr ' ' '\n' | awk 'NF && $1 != '"$$"' && $1 != '"$PPID"' {print}' | sort -n | uniq
}

pids="$(collect_project_pids)"

if [ -z "$pids" ]; then
  echo "没有发现运行中的 My Radio 服务"
else
  echo "停止 My Radio 进程: $(echo "$pids" | tr '\n' ' ')"
  echo "$pids" | xargs kill 2>/dev/null || true
  sleep 1

  alive=""
  for pid in $pids; do
    if kill -0 "$pid" 2>/dev/null; then
      alive="$alive $pid"
    fi
  done
  if [ -n "$alive" ]; then
    echo "$alive" | xargs kill -9 2>/dev/null || true
  fi
  echo "My Radio 已停止"
fi
