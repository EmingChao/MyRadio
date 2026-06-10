# 运行日志功能实现计划

目标：在设置中提供当前 session 的实时运行日志，帮助定位电台创建、AI 编排、网易云事实增强、Mimo TTS、续播等步骤是否超时或报错。

实现范围：
- 后端新增轻量结构化运行日志服务，写入 `server/data/runtime-logs/`。
- WebSocket 新增 `RUN_LOG` 事件，按 session 实时推送日志。
- 前端新增运行日志面板，入口放在设置里，打开后显示当前 session 从打开时刻开始的日志。
- `start.sh` 启动前清理 `runtime-logs` 历史文件。
- 只记录可读摘要，不记录 API Key、Cookie、完整 base64 或完整外部响应体。

实施步骤：
- 新增运行日志服务和测试，验证写入、读取、按时间游标过滤、启动清理。
- 在 Radio 创建/续播、Claude、网易云事实增强、TTS/Mimo 关键链路打点。
- 新增 `/api/radio/session/:id/runtime-logs` 查询接口。
- 扩展 WebSocket 类型并让前端接收 `RUN_LOG`。
- 新增 `RuntimeLogPanel.vue` 和前端 store/API。
- 更新 `start.sh` 清理历史运行日志。
- 跑后端测试、前端构建，并用 Chrome DevTools 验证设置入口和日志实时显示。
