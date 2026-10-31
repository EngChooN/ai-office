<div align="center">

<img src="site/assets/icon.png" width="96" alt="AI Office">

# AI Office

**ClaudeとGPTの社員を雇って、オフィスのように仕事を任せましょう。**

言葉で仕事を頼み、大事な作業だけ承認し、終わったら報告が届く無料のオープンソース デスクトップアプリです。<br>コマンド画面も難しい設定も不要です。

<a href="https://github.com/EngChooN/ai-office/releases/latest"><img alt="最新リリース" src="https://img.shields.io/github/v/release/EngChooN/ai-office?include_prereleases&style=flat-square&label=最新リリース"></a>
<a href="https://github.com/EngChooN/ai-office/releases/latest"><img alt="ダウンロード" src="https://img.shields.io/github/downloads/EngChooN/ai-office/total?style=flat-square&label=ダウンロード"></a>
<img alt="platform" src="https://img.shields.io/badge/Mac%20%C2%B7%20Windows%20%C2%B7%20Android-555?style=flat-square">
<a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square"></a>

[English](README.md) · [한국어](README.ko.md) · [日本語](README.ja.md) · [中文](README.zh.md)

</div>

<p align="center">
  <img src="docs/launch/gif/office-10s.gif" width="800" alt="AI Office の実際の画面 — 席で働く社員、承認依頼、報告">
</p>

## ⬇️ ダウンロード

<p align="center">
  <a href="https://github.com/EngChooN/ai-office/releases/latest/download/AI-Office-mac-arm64.dmg"><img alt="macOS" src="https://img.shields.io/badge/macOS-Download-000000?style=for-the-badge&logo=apple&logoColor=white"></a>
  <a href="https://github.com/EngChooN/ai-office/releases/latest/download/AI-Office-win-x64-Setup.exe"><img alt="Windows" src="https://img.shields.io/badge/Windows-Download-0078D4?style=for-the-badge&logo=windows&logoColor=white"></a>
  <a href="https://github.com/EngChooN/ai-office/releases/latest/download/AI-Office-android.apk"><img alt="Android" src="https://img.shields.io/badge/Android-Download-3DDC84?style=for-the-badge&logo=android&logoColor=white"></a>
</p>

無料です。パソコンで **Claude** か **GPT（ChatGPT）** のどちらかにログインしていれば始められます。別の登録や API キーは不要です。

> 初回起動時の警告、必要条件、Windows・スマホの案内は [インストール前にお読みください](#インストール前にお読みください) にあります。

## ✨ できること

| | 機能 | 説明 |
|:-:|---|---|
| 👥 | **ClaudeとGPTの社員を一緒に** | 社員ごとに Claude か GPT を選べます。どちらか一方だけでも始められます（GPT社員は試験版）。 |
| 💬 | **雇って、言葉で頼む** | 職種と見た目を選べば準備完了。グループチャットで @名前 と呼ぶだけ。誰も呼ばなければ合う社員が引き受けます。 |
| ✅ | **大事な作業は承認で** | ファイルの変更やコマンド実行は、まず承認箱に届きます。気に入らなければワンクリックで元に戻せます。 |
| 🧑‍💼 | **リーダーが分担して進行** | 大きな仕事をリーダーに渡すと、計画を立てて分担し、確認後に進めて報告します。進み具合は業務ボードで確認できます。 |
| 🏢 | **育つオフィス** | 誰が働き誰が待っているか一目で分かります。レベルが上がるとオフィスが広がり、家具で飾れます。 |
| 📱 | **スマホからも** | Androidアプリをつなぐと、席を離れてもダッシュボード・承認箱・グループチャットが使えます。 |

## 🚀 クイックスタート

1. **インストールしてログイン** — 上からお使いのパソコン用をダウンロードして開きます。そのパソコンで Claude か GPT（ChatGPT）にログインしておいてください。
2. **最初の社員を雇う** — 職種を選び、Claude と GPT のどちらで働くか決めます。席についたらすぐ準備します。
3. **仕事を頼んで承認** — グループチャットで頼み、承認箱で承認し、終わったら報告を受け取ります。

## 🔗 リンク

[紹介サイト](https://engchoon.github.io/ai-office/) · [不具合・ご意見を送る](https://github.com/EngChooN/ai-office/issues/new) · [すべてのリリース](https://github.com/EngChooN/ai-office/releases/latest)

---

## プロジェクトについて

Claude の社員と GPT の社員を一緒に**採用**し、ひとつのオフィスのように仕事を任せ、承認し、報告を受ける無料・オープンソースのデスクトップアプリ（Electron）です。社員は Claude Code または Codex（GPT）のセッションです。旧名称は Claude Office で、初回起動時に既存データを自動コピーします（旧フォルダーはそのまま残ります）。

- 状態: **0.18.0**（2026-10-31）— GPT社員（ベータ）· オフィスマップ（チームエリア・会議室・休憩室）· チーム／チームリーダーへの委任 · タスクボード · 承認箱 · グループチャット · 会議 · 予約タスク · レポート · 給与明細 · 模様替え
- スタック: Electron Forge + Vite · React 19 · Zustand · Tailwind 4 + shadcn/ui · Phaser 4 · SQLite（`node:sqlite`）· Claude Agent SDK · Codex app-server（GPT 社員）

## インストール前にお読みください
- 上のボタンでダウンロードした `.dmg` を開き、Applications にドラッグします（自分でビルドした場合は `app/out/make/dmg/arm64/AI-Office.dmg`）
- Apple Silicon 専用 · 署名・公証なし → 初回起動時に「開発元を確認できない」と表示されたら、システム設定 › プライバシーとセキュリティ › 「このまま開く」
- 必要条件: その Mac で Claude（Claude Code）または GPT（ChatGPT・Codex）のどちらか1つ以上にログインしていること。両方つなぐと社員ごとに選べます（社員はそのアカウントで働き、料金もそのアカウントに請求されます）
- 再ビルド: `cd app && pnpm make`

## Windows（第1弾 · 試験版）
- インストール: `AI-Office-win-x64-Setup.exe` をダウンロードして実行すると、ユーザーフォルダにインストールされ、スタートメニューとデスクトップにショートカットができます（管理者権限は不要）。以降のアップデートはアプリ内から新しい Setup.exe で行われます
- ビルド: `cd app && pnpm install && pnpm make:win` → `app/out/make/squirrel.windows/x64/AI-Office-win-x64-Setup.exe`（Mac には wine がなくインストーラーを作れません。GitHub Actions の `win-installer` でビルド）
  - Mac でビルドしても構いません。`pnpm-workspace.yaml` の `supportedArchitectures` により、Windows x64 用の claude 実行ファイルパッケージも取得されます（設定を変えたあと `pnpm install` を一度実行してください）
- 署名なし → Setup.exe を初めて開くとき SmartScreen の「Windows によって PC が保護されました」が出たら「詳細情報 › 実行」
- 以前 zip を展開して使っていた方: Setup.exe でインストールしたあと、古いフォルダを削除してください（設定と履歴は引き継がれます）
- データ: `%APPDATA%\AI Office\office.db`
- まだ Mac 専用: 外部社員の通知・質問受付（hooks）、画面キャプチャ。作業結果の確認（コミット・PR）には Git for Windows と GitHub CLI が必要で、まだ実際の確認はしていません

## スマホからのリモート操作（0.8.0〜）
- 設定 › スマホ接続でオンにし、QR コードで Android アプリ（`android/`）を接続します。**初期状態はオフ。** オンにするとこの PC のポート（初期値 47900）がインターネット側に開くので、使わないときはオフにしてください。
- スマホからの承認・指示は、PC で直接行うのと同じ権限を持ちます。紛失した場合は「QR を作り直す」を押してください。
- 通知は約15分ごとに確認する方式のため、数十分遅れることがあります。PC のリモートキーが変わった場合（証明書の固定）は、QR を作り直して再接続してください。
- 互換性: デスクトップ **0.8.0 以上** ↔ Android **1.0.x** ↔ プロトコル **v1**（`docs/specs/remote-protocol-v1.md`）。デスクトップ **0.9.0 以上** ↔ Android **1.1.x** ↔ プロトコル **v2**（PC 画面全体、`docs/specs/remote-protocol-v2.md`）— 1.0.x のアプリも 0.9.0 の PC には v1 で引き続き接続できます。**0.10.1 からスマホアプリの番号は PC と同じです（PC 0.10.1 ↔ スマホ 0.10.1。上の 1.x 表記はそれ以前の履歴です）。** アプリのビルド・署名フィンガープリントは `android/README.md`、0.8.0 のリリースノートは `docs/release-notes/0.8.0.md` を参照してください。

## 開発時の実行
```bash
cd app
pnpm install
pnpm start
```
- ログイン: 別途 API キーは不要で、この Mac の Claude Code・Codex のログインをそのまま使います。接続状態は設定でプロバイダーごとに確認できます。
- データ: `~/Library/Application Support/AI Office/office.db`
- 1つのデータフォルダは1つのアプリだけが使います（`office.lock`）。インストール版が起動していると、開発版は「すでに起動しています」と表示して終了します。インストール版を起動したまま開発版や QA を動かすには、別のフォルダを指定します: `CLAUDE_OFFICE_USER_DATA=~/claude-office-dev pnpm start`

## 社員の2種類
| | 雇用社員 | 外部社員 |
|---|---|---|
| 正体 | アプリが起動したセッション（Claude: Agent SDK · GPT: Codex app-server） | ターミナル・デスクトップアプリで既に実行中の Claude Code・Codex セッション |
| 状態 | リアルタイム（ストリーム） | Claude: `~/.claude/sessions` レジストリを2秒ごとにポーリング（+ オプトインの hooks）· Codex: `~/.codex/sessions` の記録ファイルで閲覧のみ |
| 指示・承認 | アプリで | 元のウィンドウで |
| 今日の作業 | アプリ DB | トランスクリプト jsonl |

## フォルダ
- `app/` — アプリ（`src/main` メインプロセス、`src/renderer` 画面、`src/shared` 共通の型）
- `spikes/` — 第1段階の連携検証スクリプト
- `docs/` — 調査・スパイクの記録

## ドキュメント
- [CONTEXT.md](CONTEXT.md) — 初めて見る人のための背景資料 · [intro.html](intro.html) — 紹介スライド（ブラウザで開く） · [SPEC.md](SPEC.md) — 決定済みの仕様 · [CHANGELOG.ja.md](CHANGELOG.ja.md) — 変更履歴 · [docs/spike-integration.md](docs/spike-integration.md)
