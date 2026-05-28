#!/bin/bash
# 一键启动 My Radio 前后端

ROOT="$(cd "$(dirname "$0")" && pwd)"

# 先杀掉旧进程
lsof -ti :15620 | xargs kill -9 2>/dev/null
lsof -ti :3000 | xargs kill -9 2>/dev/null
sleep 1

echo "启动后端..."
cd "$ROOT/server" && npm run dev > /tmp/radio-server.log 2>&1 &

echo "启动前端..."
cd "$ROOT/web" && npm run dev > /tmp/radio-frontend.log 2>&1 &

sleep 3
echo "后端: $(curl -s http://localhost:15620/api/health | python3 -c 'import sys,json;print(json.load(sys.stdin)["status"])' 2>/dev/null || echo '启动中...')"
echo "前端: http://localhost:3000"
echo ""
echo "日志: tail -f /tmp/radio-server.log /tmp/radio-frontend.log"
