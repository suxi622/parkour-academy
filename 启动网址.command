#!/bin/bash
# 双击本文件即可启动「本地服务 + 实时榜单后端」（macOS）
cd "$(dirname "$0")" || exit 1
PORT="${PORT:-8080}"

echo "汤姆猫跑酷学堂 · 精致版"
echo "正在启动本地服务（含实时榜单后端）：http://127.0.0.1:${PORT}/index.html"
echo "关闭此窗口即可停止服务。"

(sleep 1.5 && open "http://127.0.0.1:${PORT}/index.html") &
node server/server.js --port "$PORT" --host 127.0.0.1
