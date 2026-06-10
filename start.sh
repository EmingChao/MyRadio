#!/bin/bash
# 一键启动 My Radio 前后端

ROOT="$(cd "$(dirname "$0")" && pwd)"
PID_DIR="$ROOT/.tmp"
SERVER_PID_FILE="$PID_DIR/radio-server.pid"
FRONTEND_PID_FILE="$PID_DIR/radio-frontend.pid"

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
  local pid_file_pids

  port_pids="$(lsof -ti :15620 -ti :3000 2>/dev/null || true)"
  project_pids="$(pgrep -f "$ROOT/(server|web)" 2>/dev/null || true)"
  pid_file_pids="$(cat "$SERVER_PID_FILE" "$FRONTEND_PID_FILE" 2>/dev/null || true)"
  pids="$port_pids $project_pids $pid_file_pids"

  for pid in $port_pids $project_pids $pid_file_pids; do
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
  rm -f "$SERVER_PID_FILE" "$FRONTEND_PID_FILE"
}

cleanup_project_processes
mkdir -p "$PID_DIR"

# 每次重新启动只保留本次进程的运行日志，避免界面里混入旧 session 的排查信息。
rm -rf "$ROOT/server/data/runtime-logs"
mkdir -p "$ROOT/server/data/runtime-logs"

echo "启动后端..."
(
  cd "$ROOT/server" || exit 1
  nohup ./node_modules/.bin/tsx watch src/index.ts > /tmp/radio-server.log 2>&1 < /dev/null &
  echo $! > "$SERVER_PID_FILE"
)

echo "启动前端..."
(
  cd "$ROOT/web" || exit 1
  nohup ./node_modules/.bin/vite --host 0.0.0.0 > /tmp/radio-frontend.log 2>&1 < /dev/null &
  echo $! > "$FRONTEND_PID_FILE"
)

sleep 3
echo "后端: $(curl -s http://localhost:15620/api/health | python3 -c 'import sys,json;print(json.load(sys.stdin)["status"])' 2>/dev/null || echo '启动中...')"
echo "前端: http://localhost:3000"
echo ""
echo "日志: tail -f /tmp/radio-server.log /tmp/radio-frontend.log"
