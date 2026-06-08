#!/bin/bash
# 一键启动 My Radio 前后端

ROOT="$(cd "$(dirname "$0")" && pwd)"

# 收集指定 PID 的所有子进程，避免只杀监听端口进程后留下 npm/tsx watch。
collect_children() {
  local parent="$1"
  local children
  children="$(pgrep -P "$parent" 2>/dev/null || true)"
  for child in $children; do
    echo "$child"
    collect_children "$child"
  done
}

# 启动前清理当前项目残留的前后端开发进程。
cleanup_project_processes() {
  local pids=""
  local port_pids
  local project_pids

  port_pids="$(lsof -ti :15620 -ti :3000 2>/dev/null || true)"
  project_pids="$(pgrep -f "$ROOT/(server|web)" 2>/dev/null || true)"
  pids="$port_pids $project_pids"

  for pid in $port_pids $project_pids; do
    pids="$pids $(collect_children "$pid")"
  done

  pids="$(echo "$pids" | tr ' ' '\n' | awk 'NF && $1 != '"$$"' && $1 != '"$PPID"' {print}' | sort -n | uniq)"
  if [ -z "$pids" ]; then
    return
  fi

  echo "清理旧进程: $(echo "$pids" | tr '\n' ' ')"
  echo "$pids" | xargs kill 2>/dev/null || true
  sleep 1

  # 对仍未退出的 watch 子进程做强制清理，防止端口和日志继续被旧进程占用。
  local alive=""
  for pid in $pids; do
    if kill -0 "$pid" 2>/dev/null; then
      alive="$alive $pid"
    fi
  done
  if [ -n "$alive" ]; then
    echo "$alive" | xargs kill -9 2>/dev/null || true
  fi
}

cleanup_project_processes

echo "启动后端..."
nohup sh -c "cd '$ROOT/server' && npm run dev" > /tmp/radio-server.log 2>&1 < /dev/null &

echo "启动前端..."
nohup sh -c "cd '$ROOT/web' && npm run dev -- --host 0.0.0.0" > /tmp/radio-frontend.log 2>&1 < /dev/null &

sleep 3
echo "后端: $(curl -s http://localhost:15620/api/health | python3 -c 'import sys,json;print(json.load(sys.stdin)["status"])' 2>/dev/null || echo '启动中...')"
echo "前端: http://localhost:3000"
echo ""
echo "日志: tail -f /tmp/radio-server.log /tmp/radio-frontend.log"
