<div align="center">

<img src="site/assets/icon.png" width="96" alt="AI Office">

# AI Office

**雇用 Claude 和 GPT 员工，像办公室一样交给他们工作。**

用说话的方式分配工作，只审批重要的事，完成后收到汇报的免费开源桌面应用。<br>无需命令行，无需复杂设置。

<a href="https://github.com/EngChooN/ai-office/releases/latest"><img alt="最新版本" src="https://img.shields.io/github/v/release/EngChooN/ai-office?include_prereleases&style=flat-square&label=最新版本"></a>
<a href="https://github.com/EngChooN/ai-office/releases/latest"><img alt="下载量" src="https://img.shields.io/github/downloads/EngChooN/ai-office/total?style=flat-square&label=下载量"></a>
<img alt="platform" src="https://img.shields.io/badge/Mac%20%C2%B7%20Windows%20%C2%B7%20Android-555?style=flat-square">
<a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square"></a>

[English](README.md) · [한국어](README.ko.md) · [日本語](README.ja.md) · [中文](README.zh.md)

</div>

<p align="center">
  <img src="docs/launch/gif/office-10s.gif" width="800" alt="AI Office 实际画面 — 员工在工位工作、审批请求与汇报">
</p>

## ⬇️ 下载

<p align="center">
  <a href="https://github.com/EngChooN/ai-office/releases/latest/download/AI-Office-mac-arm64.dmg"><img alt="macOS" src="https://img.shields.io/badge/macOS-Download-000000?style=for-the-badge&logo=apple&logoColor=white"></a>
  <a href="https://github.com/EngChooN/ai-office/releases/latest/download/AI-Office-win-x64-Setup.exe"><img alt="Windows" src="https://img.shields.io/badge/Windows-Download-0078D4?style=for-the-badge&logo=windows&logoColor=white"></a>
  <a href="https://github.com/EngChooN/ai-office/releases/latest/download/AI-Office-android.apk"><img alt="Android" src="https://img.shields.io/badge/Android-Download-3DDC84?style=for-the-badge&logo=android&logoColor=white"></a>
</p>

免费。只要电脑上登录了 **Claude** 或 **GPT（ChatGPT）** 其中一个账户即可开始，无需另外注册或 API 密钥。

> 首次打开的提示、前提条件以及 Windows、手机的说明见 [安装前请阅读](#安装前请阅读)。

## ✨ 你可以这样用

| | 功能 | 说明 |
|:-:|---|---|
| 👥 | **Claude 与 GPT 员工一起** | 每位员工可选择用 Claude 还是 GPT。只有其中一个也能开始（GPT 员工为测试版）。 |
| 💬 | **雇用，然后直接吩咐** | 选好职务和外观就准备好了。在群聊里 @名字 即可，没人被点名时会由合适的员工接手。 |
| ✅ | **重要的事先审批** | 修改文件或执行命令会先进入审批箱。不满意可以一键恢复。 |
| 🧑‍💼 | **组长分工推进** | 把大任务交给组长，它会制定计划并分工，经你确认后推进并汇报。进度可在任务看板查看。 |
| 🏢 | **会成长的办公室** | 谁在工作、谁在等待一目了然。等级提升后办公室会变大，还可以用家具装饰。 |
| 📱 | **手机也能用** | 连接 Android 应用后，离开座位也能使用仪表盘、审批箱和群聊。 |

## 🚀 快速开始

1. **安装并登录** — 从上方下载适合你电脑的版本并打开。请确保该电脑已登录 Claude 或 GPT（ChatGPT）。
2. **雇用第一位员工** — 选择职务，并决定用 Claude 还是 GPT 工作。入座后马上就绪。
3. **交代任务并审批** — 在群聊里吩咐，在审批箱里批准，完成后收到汇报。

## 🔗 链接

[介绍网站](https://engchoon.github.io/ai-office/) · [反馈问题 / 意见](https://github.com/EngChooN/ai-office/issues/new) · [所有版本](https://github.com/EngChooN/ai-office/releases/latest)

---

## 关于本项目

同时**雇用** Claude 员工和 GPT 员工，像一间办公室一样分配工作、审批、接收汇报的免费开源桌面应用（Electron）。员工是 Claude Code 或 Codex（GPT）会话。旧名称为 Claude Office，首次启动时会自动复制已有数据（旧文件夹保持不动）。

- 状态：**0.16.0**（2026-10-30）— GPT 员工（测试版）· 办公室地图（团队区域、会议室、休息室）· 团队/组长委派 · 任务看板 · 审批箱 · 群聊 · 会议 · 定时任务 · 报告 · 工资单 · 布置
- 技术栈：Electron Forge + Vite · React 19 · Zustand · Tailwind 4 + shadcn/ui · Phaser 4 · SQLite（`node:sqlite`）· Claude Agent SDK · Codex app-server（GPT 员工）

## 安装前请阅读
- 打开上方按钮下载的 `.dmg`，拖到 Applications 文件夹（自行构建时位于 `app/out/make/dmg/arm64/AI-Office.dmg`）
- 仅限 Apple Silicon · 未签名/未公证 → 首次打开时若出现“无法验证开发者”提示，请前往 系统设置 › 隐私与安全性 › “仍要打开”
- 前提条件：该 Mac 上已登录 Claude（Claude Code）或 GPT（ChatGPT · Codex）中的至少一个。两者都连接时可按员工选择（员工使用该账户工作，费用也计入该账户）
- 重新构建：`cd app && pnpm make`

## Windows（第一阶段 · 试用版）
- 安装：下载并运行 `AI-Office-win-x64-Setup.exe`，会安装到用户文件夹，并创建开始菜单和桌面快捷方式（无需管理员权限）。之后的更新在应用内通过新的 Setup.exe 进行
- 构建：`cd app && pnpm install && pnpm make:win` → `app/out/make/squirrel.windows/x64/AI-Office-win-x64-Setup.exe`（Mac 没有 wine，无法生成安装程序，请用 GitHub Actions 的 `win-installer` 构建）
  - 在 Mac 上构建也可以。`pnpm-workspace.yaml` 中的 `supportedArchitectures` 会同时下载 Windows x64 用 claude 可执行文件包（修改设置后需要运行一次 `pnpm install`）
- 未签名 → 首次打开 Setup.exe 时若出现 SmartScreen“Windows 已保护你的电脑”窗口，点击“更多信息 › 仍要运行”
- 之前解压 zip 使用的用户：用 Setup.exe 安装后删除旧文件夹即可（设置和记录会保留）
- 数据：`%APPDATA%\AI Office\office.db`
- 目前仅 Mac 支持：外部员工通知与提问接收（hooks）、屏幕截图。工作成果检查（提交·PR）需要 Git for Windows 和 GitHub CLI，且尚未实际验证

## 手机远程（0.8.0 起）
- 在 设置 › 手机连接 中开启，然后用二维码连接安卓应用（`android/`）。**默认关闭。** 开启后，本机端口（默认 47900）会向互联网开放，不用时请关闭。
- 从手机进行的审批和指令与在电脑上直接操作具有相同权限。若手机丢失，请点击“重新生成二维码”。
- 通知大约每 15 分钟检查一次，因此可能延迟几十分钟。若 PC 的远程密钥变化（证书固定），请重新生成二维码并重新连接。
- 兼容性：电脑 **0.8.0 及以上** ↔ 安卓 **1.0.x** ↔ 协议 **v1**（`docs/specs/remote-protocol-v1.md`）。电脑 **0.9.0 及以上** ↔ 安卓 **1.1.x** ↔ 协议 **v2**（整个 PC 屏幕，`docs/specs/remote-protocol-v2.md`）— 1.0.x 应用仍可通过 v1 连接 0.9.0 的电脑。**从 0.10.1 起，手机应用版本号与电脑相同（PC 0.10.1 ↔ 手机 0.10.1；上面的 1.x 标注是之前的历史）。** 应用构建和签名指纹见 `android/README.md`，0.8.0 的发布说明见 `docs/release-notes/0.8.0.md`。

## 开发运行
```bash
cd app
pnpm install
pnpm start
```
- 登录：无需单独的 API 密钥，直接使用本机 Claude Code 和 Codex 的登录状态。各提供方的连接状态可在设置中查看。
- 数据：`~/Library/Application Support/AI Office/office.db`
- 一个数据文件夹只能由一个应用使用（`office.lock`）。若已启动安装版，开发版会显示“已经在运行”并退出。要在保持安装版运行的同时启动开发版或 QA，请指定其他文件夹：`CLAUDE_OFFICE_USER_DATA=~/claude-office-dev pnpm start`

## 两类员工
| | 雇用员工 | 外部员工 |
|---|---|---|
| 身份 | 应用启动的会话（Claude：Agent SDK · GPT：Codex app-server） | 在终端或桌面应用中已在运行的 Claude Code、Codex 会话 |
| 状态 | 实时（流） | Claude：每 2 秒轮询 `~/.claude/sessions` 注册表（+ 可选开启的 hooks）· Codex：通过 `~/.codex/sessions` 记录文件仅查看 |
| 指令·审批 | 在应用中 | 在原窗口中 |
| 今日工作 | 应用数据库 | 对话记录 jsonl |

## 目录
- `app/` — 应用（`src/main` 主进程、`src/renderer` 界面、`src/shared` 共享类型）
- `spikes/` — 第一阶段联动验证脚本
- `docs/` — 调研与 spike 记录

## 文档
- [CONTEXT.md](CONTEXT.md) — 给新人的背景资料 · [intro.html](intro.html) — 介绍幻灯片（用浏览器打开） · [SPEC.md](SPEC.md) — 已确定的规格 · [CHANGELOG.zh.md](CHANGELOG.zh.md) — 变更记录 · [docs/spike-integration.md](docs/spike-integration.md)
