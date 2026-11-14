<div align="center">

<img src="site/assets/icon.png" width="96" alt="AI Office">

# AI Office

**一句话交代，AI 员工就开工的专属办公室。**

雇用 Claude 和 GPT 员工来分配工作，只审批重要的事，完成后收到汇报的免费开源应用。<br>无需命令行，无需复杂设置。

<a href="https://github.com/EngChooN/ai-office/releases/latest"><img alt="最新版本" src="https://img.shields.io/github/v/release/EngChooN/ai-office?include_prereleases&style=flat-square&label=最新版本"></a>
<a href="https://github.com/EngChooN/ai-office/releases/latest"><img alt="下载量" src="https://img.shields.io/github/downloads/EngChooN/ai-office/total?style=flat-square&label=下载量"></a>
<img alt="platform" src="https://img.shields.io/badge/Mac%20%C2%B7%20Windows%20%C2%B7%20Android-555?style=flat-square">
<a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square"></a>

[English](README.md) · [한국어](README.ko.md) · [日本語](README.ja.md) · [中文](README.zh.md)

</div>

<p align="center">
  <img src="docs/launch/gif/office-1.0.gif" width="800" alt="AI Office 实际画面 — 员工在工位工作、审批请求与汇报">
</p>

## ⬇️ 下载

<p align="center">
  <a href="https://github.com/EngChooN/ai-office/releases/latest/download/AI-Office-mac-arm64.dmg"><img alt="macOS" src="https://img.shields.io/badge/macOS-Download-000000?style=for-the-badge&logo=apple&logoColor=white"></a>
  <a href="https://github.com/EngChooN/ai-office/releases/latest/download/AI-Office-win-x64-Setup.exe"><img alt="Windows" src="https://img.shields.io/badge/Windows-Download-0078D4?style=for-the-badge&logo=windows&logoColor=white"></a>
  <a href="https://github.com/EngChooN/ai-office/releases/latest/download/AI-Office-android.apk"><img alt="Android" src="https://img.shields.io/badge/Android-Download-3DDC84?style=for-the-badge&logo=android&logoColor=white"></a>
</p>

免费。只要电脑上登录了 **Claude** 或 **GPT（ChatGPT）** 其中一个账户即可开始，无需另外注册或 API 密钥。

> 首次打开的提示、前提条件以及 Windows、手机的说明见 [安装前请阅读](#安装前请阅读)。

## ✨ 你可以做什么

| | 功能 | 说明 |
|:-:|---|---|
| 🧑‍💼 | **先对秘书说** | 秘书直接在回复里的卡片中接收审批，汇总夜里发生的事，长对话也能接着聊。员工做出的文件也能帮你找。 |
| 👥 | **Claude 与 GPT 员工一起用** | 每位员工可选择用 Claude 还是 GPT 工作。只有其中一个也能开始。 |
| 💬 | **像聊天软件一样的对话室** | 下达指令后能看到“已收到 → 进行中 → 完成”。回复、定时、插话也都可以。 |
| ✅ | **重要的事走审批** | 有风险的操作会用一行字说明要做什么，并先征求你的同意。改过的文件可以撤回。 |
| 🧭 | **组长分工推进** | 把大任务交给组长，它会拆分计划，经你确认后执行并汇报。 |
| 📱 | **手机上也能用** | 连接安卓应用后，不在座位上也能审批、对话。点一下就会立刻变成“处理中”。 |
| 🎮 | **按你的喜好** | 10 种配色主题、复古办公室游戏主题，以及越用越大的办公室。 |

## 🚀 快速开始

1. **安装并登录** — 从上方下载适合你电脑的版本并打开。该电脑上需要已登录 Claude 或 GPT（ChatGPT）。
2. **雇第一位员工** — 选择职位，并决定用 Claude 还是 GPT 工作。
3. **交办工作并审批** — 在群聊或对秘书用说话的方式下达指令，审批，完成后收到汇报。

## 🔗 链接

[介绍网站](https://engchoon.github.io/ai-office/) · [反馈问题 / 意见](https://github.com/EngChooN/ai-office/issues/new) · [所有版本](https://github.com/EngChooN/ai-office/releases/latest) · [更新动态](CHANGELOG.zh.md) · [赞助支持](https://fairy.hada.io/@ai-office)

---

## 关于本项目

同时**雇用** Claude 员工和 GPT 员工，像一间办公室一样分配工作、审批、接收汇报的免费开源桌面应用（Electron）。员工是 Claude Code 或 Codex（GPT）会话。旧名称为 Claude Office，首次启动时会自动复制已有数据（旧文件夹保持不动）。

## 安装前请阅读

**Mac**
- 打开上方按钮下载的 `.dmg`，拖到 Applications 文件夹。
- 仅限 Apple Silicon，未签名/未公证。首次打开时若出现“无法验证开发者”提示，请前往 系统设置 › 隐私与安全性 › “仍要打开”。

**Windows**
- 下载并运行 `AI-Office-win-x64-Setup.exe`，会安装到用户文件夹，并在开始菜单和桌面创建快捷方式（无需管理员权限）。之后的更新在应用内进行。
- 未签名。首次打开 Setup.exe 时若出现 SmartScreen“Windows 已保护你的电脑”窗口，请点击“更多信息 › 仍要运行”。
- 以前解压 zip 使用的用户：用 Setup.exe 安装后删除旧文件夹即可（设置和记录会保留）。
- 数据位于 `%APPDATA%\AI Office\office.db`。
- 目前仅限 Mac：在应用外启动的员工的通知与提问接收（hooks）、屏幕截图。审查任务结果（提交 · PR）需要 Git for Windows 和 GitHub CLI，尚未实际验证。

**共同前提条件**
- 该电脑上已登录 Claude（Claude Code）或 GPT（ChatGPT · Codex）中的至少一个。两者都连接时可按员工选择。员工使用该账户工作，费用也计入该账户。

## 手机连接

- 在 设置 › 手机连接 中开启，并用二维码连接安卓应用。**默认关闭。** 开启后默认仅通过 Tailscale 地址连接，也可选择仅限同一网络或路由器端口转发。端口转发会让这台电脑的端口（默认 47900）对互联网开放，不用时请关闭。
- 手机上的审批和指令，权限与在电脑上直接操作相同。手机丢失时请点“重新生成二维码”。
- 通知约每 15 分钟检查一次，可能延迟数十分钟。电脑的远程密钥改变后，请重新生成二维码并重新连接。
- 手机应用请使用与电脑相同的版本。应用构建与签名指纹见 `android/README.md`。

## 开发者

```bash
cd app
pnpm install
pnpm start
```

- 技术栈：Electron Forge + Vite · React 19 · Zustand · Tailwind 4 + shadcn/ui · Phaser 4 · SQLite（`node:sqlite`）· Claude Agent SDK · Codex app-server（GPT 员工）
- 登录：无需单独的 API 密钥，直接使用这台电脑上 Claude Code 和 Codex 的登录。连接状态可在设置中按提供方查看。
- 数据：Mac 为 `~/Library/Application Support/AI Office/office.db`
- 一个数据文件夹同一时间只能被一个应用使用（`office.lock`）。若已安装版正在运行，开发版会提示“已在运行”并退出。要在已安装版运行时启动开发版或 QA，请指定另一个文件夹：`AI_OFFICE_USER_DATA=~/ai-office-dev pnpm start`（旧名称 `CLAUDE_OFFICE_USER_DATA` 仍可识别）
- 构建 Mac 安装包：`cd app && pnpm make` → `app/out/make/dmg/arm64/AI-Office.dmg`
- 构建 Windows 安装包：`cd app && pnpm install && pnpm make:win` → `app/out/make/squirrel.windows/x64/AI-Office-win-x64-Setup.exe`。Mac 没有 wine，所以用 GitHub Actions 的 `win-installer` 构建。在 Mac 上也可通过 `pnpm-workspace.yaml` 的 `supportedArchitectures` 提前下载 Windows x64 用的 claude 可执行文件包（修改设置后运行一次 `pnpm install`）。
- 文件夹：`app/`（应用：`src/main` 主进程、`src/renderer` 界面、`src/shared` 共用类型）· `android/`（手机应用）· `site/`（介绍网站）· `docs/`（规格与调研记录）
- 文档：[CONTEXT.md](CONTEXT.md)（给新人的背景说明，含两类员工的介绍）· [intro.html](intro.html)（介绍幻灯片）· [SPEC.md](SPEC.md)（已确定的规格）· [CHANGELOG.zh.md](CHANGELOG.zh.md)（变更记录）
