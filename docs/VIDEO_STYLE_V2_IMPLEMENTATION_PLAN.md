# Claudio 视频风格 V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Radio 首屏从“黑绿终端播放器”调整为视频参考里的 AI DJ 氛围型手机界面。

**Architecture:** 只修改 Web 前端视觉层，保持现有 Vue 3 + Pinia 状态和后端接口不变。通过全局 token、播放器结构、DJ Feed 卡片和底部导航样式实现 V2 氛围；动效使用 CSS，不引入新的运行时依赖。

**Tech Stack:** Vue 3、TypeScript、Vite、Pinia、CSS scoped styles。

---

## File Structure

- Modify: `web/src/style.css`
  - 负责全局色彩、字体、圆角、玻璃/纸片/波形 token，以及 reduced motion 兜底。
- Modify: `web/src/views/HomeView.vue`
  - 负责手机舞台背景、Radio 页布局背景层、Command Dock 视觉。
- Modify: `web/src/components/RadioPlayer.vue`
  - 负责播放器主视觉，删除唱片旋转，改为 album tile、封面呼吸、播放波形、DJ voice note。
- Modify: `web/src/components/DjChat.vue`
  - 负责 DJ 内容流视觉，弱化日志感，重做 Open/Now/Next/Context 卡片和输入框。
- Modify: `web/src/components/ClaudioHeader.vue`
  - 负责顶部人格化状态，减少终端标签感。
- Modify: `web/src/components/BottomTabs.vue`
  - 负责底部导航减弱绿色占比，增强手机工具栏感。

## Task 1: 全局 V2 视觉 Token

**Files:**
- Modify: `web/src/style.css`
- Modify: `web/src/views/HomeView.vue`

- [ ] **Step 1: 更新全局 token**

将 `:root` 中的舞台色调整为深色氛围系统，保留旧变量映射，避免影响其他组件。

- [ ] **Step 2: 增加全局动效兜底**

增加 `cover-breathe`、`wave-rise`、`ambient-drift` 和 `prefers-reduced-motion` 规则。

- [ ] **Step 3: 调整 HomeView 舞台**

在 `.app-stage` 和 `.phone-shell` 中增加柔和深色背景、玻璃边界和氛围光，降低纯黑与绿色光占比。

## Task 2: RadioPlayer 声音舞台重构

**Files:**
- Modify: `web/src/components/RadioPlayer.vue`

- [ ] **Step 1: 增加波形数据**

在 `<script setup>` 中增加 `waveBars` 常量，用于渲染 CSS 波形。

- [ ] **Step 2: 替换唱片 DOM**

将 `.disc-wrap/.disc/.disc-hole` 替换为 `.cover-stack/.album-tile`，封面保持矩形圆角，不再旋转。

- [ ] **Step 3: 增加音乐波形**

在曲目信息下方增加 `.track-waveform`，播放中使用 staggered bar 动画，暂停时低幅静止。

- [ ] **Step 4: 重做 DJ voice note**

将 `.segue-bar` 改成 `.voice-note`，加入小型 voice bars 和更克制的暖纸色背景。

- [ ] **Step 5: 调整控制区**

降低播放按钮大绿圆效果，改为玻璃按钮和小面积 signal active。

## Task 3: DJ Feed 内容流重构

**Files:**
- Modify: `web/src/components/DjChat.vue`

- [ ] **Step 1: 增加 voiceBars 常量**

用于 Open brief 和 DJ talk 气泡的短波形。

- [ ] **Step 2: 重做 Open brief**

把 `.msg-open` 从大白卡改成小型 brief sheet，使用暖纸色、低圆角和短波形。

- [ ] **Step 3: 重做 Now / Next / Context**

Now 改玻璃推荐卡，Next 改 mini setlist，Context 改窄条上下文说明。

- [ ] **Step 4: 重做输入区**

输入框改 glass command dock，发送按钮改小面积 signal，发送中显示 pulse dot。

## Task 4: Header 与 Bottom Tabs 精修

**Files:**
- Modify: `web/src/components/ClaudioHeader.vue`
- Modify: `web/src/components/BottomTabs.vue`

- [ ] **Step 1: Header 降低标签感**

把状态标签改为更轻的 pill，头像使用暖色/封面感的柔和材质，减少绿色边框。

- [ ] **Step 2: Bottom Tabs 降低绿色面积**

Active 状态改成小点和文字提亮，不再让图标大面积变绿。

## Task 5: 验证

**Files:**
- Check: `web/package.json`

- [ ] **Step 1: 构建验证**

Run:

```bash
cd /Users/liumingchao/develop/private/my-redio-by-mimo/web
npm run build
```

Expected: Vite build exit code 0.

- [ ] **Step 2: 浏览器视觉验证**

使用 Chrome DevTools MCP 打开本地页面，至少验证 `390x844` 和桌面视口：

- 页面可渲染。
- 封面不再旋转成唱片。
- 有可见波形。
- DJ 开场不再是突兀大白块。
- 输入框和底部导航不重叠。
- Radio / Queue / Plan / Taste 切换仍可用。

