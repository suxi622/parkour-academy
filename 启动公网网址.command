#!/bin/bash
# 双击本文件 = 启动后端 + 生成一个公网 HTTPS 网址（需要已安装 cloudflared）
# 说明：这是 Cloudflare 的临时隧道（trycloudflare.com），本窗口关闭后网址即失效。
#      需要长期稳定的网址，请部署到云主机 / 容器平台（见 README「部署到公网」）。
cd "$(dirname "$0")" || exit 1
PORT="${PORT:-8090}"
TOKEN="${ADMIN_TOKEN:-$(openssl rand -hex 8 2>/dev/null || date +%s)}"

mkdir -p ../.pk-data
printf '%s' "$TOKEN" > ../.pk-data/admin-token.txt

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "未检测到 cloudflared，请先安装：brew install cloudflared"
  exit 1
fi

echo "汤姆猫跑酷学堂 · 公网部署"
echo "├─ 本地地址：http://127.0.0.1:${PORT}/index.html"
echo "├─ 管理令牌：${TOKEN}（清空榜单用，已存到 ../.pk-data/admin-token.txt）"
echo "└─ 正在创建公网地址，请稍候，出现 trycloudflare.com 的网址即部署完成"
echo

node server/server.js --port "$PORT" --host 127.0.0.1 --admin "$TOKEN" &
SERVER_PID=$!
sleep 1.5
(sleep 2 && open "http://127.0.0.1:${PORT}/index.html") &

cloudflared tunnel --url "http://127.0.0.1:${PORT}" --no-autoupdate

kill "$SERVER_PID" 2>/dev/null
