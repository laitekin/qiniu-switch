# 学习笔记页面

单页 HTML（`index.html`）由 Go 程序嵌入后在 `127.0.0.1:8430` 提供服务，Caddy 负责对外 HTTPS：<https://notes.latekin.cloud/>

## 重新部署

```bash
# 在服务器上（源码放在 /home/ubuntu/builds/study-notes）
docker run --rm -v "$PWD":/src -w /src -e CGO_ENABLED=0 golang:1.24-alpine \
  go build -trimpath -ldflags "-s -w" -o studynotes .
sudo install -m 0755 studynotes /opt/study-notes/studynotes
sudo systemctl restart study-notes
```

- systemd：`study-notes.service`（DynamicUser，只监听回环地址）
- Caddy：`/etc/caddy/Caddyfile` 中的 `notes.latekin.cloud` 站点块（Cloudflare 橙云 + DNS-01）
