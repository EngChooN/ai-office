<div align="center">

<img src="site/assets/icon.png" width="96" alt="AI Office">

# AI Office

**話しかけるだけで AI 社員が働く、あなただけのオフィス。**

ClaudeとGPTの社員を雇って仕事を任せ、大事な作業だけ承認し、終わったら報告が届く無料のオープンソースアプリです。<br>コマンド画面も難しい設定も不要です。

<a href="https://github.com/EngChooN/ai-office/releases/latest"><img alt="最新リリース" src="https://img.shields.io/github/v/release/EngChooN/ai-office?include_prereleases&style=flat-square&label=最新リリース"></a>
<a href="https://github.com/EngChooN/ai-office/releases/latest"><img alt="ダウンロード" src="https://img.shields.io/github/downloads/EngChooN/ai-office/total?style=flat-square&label=ダウンロード"></a>
<img alt="platform" src="https://img.shields.io/badge/Mac%20%C2%B7%20Windows%20%C2%B7%20Android-555?style=flat-square">
<a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square"></a>

[English](README.md) · [한국어](README.ko.md) · [日本語](README.ja.md) · [中文](README.zh.md)

</div>

<p align="center">
  <img src="docs/launch/gif/office-1.0.gif" width="800" alt="AI Office の実際の画面 — 席で働く社員、承認依頼、報告">
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
| 🧑‍💼 | **まず秘書に話しかける** | 秘書は返答の中のカードで承認を受け取り、夜のあいだの出来事を要約し、長い会話も続けられます。社員が作ったファイルも探してくれます。 |
| 👥 | **ClaudeとGPTの社員を一緒に** | 社員ごとに Claude と GPT のどちらで働くか選べます。片方だけでも始められます。 |
| 💬 | **メッセンジャーのようなチャット** | 頼むと「受付 → 作業中 → 完了」が見えます。返信・予約・割り込みもできます。 |
| ✅ | **大事なことは承認で** | 危険な作業は何をするかを一行で伝え、先に確認します。変更したファイルは元に戻せます。 |
| 🧭 | **リーダーが分担して進行** | 大きな仕事をリーダーに渡すと、計画を分け、確認を受けてから進めて報告します。 |
| 📱 | **スマホからも** | Android アプリをつなぐと、席を離れていても承認や会話ができます。押すとすぐ「処理中」に変わります。 |
| 🎮 | **好みに合わせて** | カラーテーマ10種、レトロなオフィスゲームのテーマ、働くほど育つオフィスです。 |

## 🚀 クイックスタート

1. **インストールしてログイン** — 上のボタンから自分のパソコン用をダウンロードして開きます。そのパソコンで Claude か GPT（ChatGPT）にログインしている必要があります。
2. **最初の社員を採用** — 職種を選び、Claude と GPT のどちらで働くか決めます。
3. **仕事を任せて承認** — グループチャットや秘書に言葉で頼み、承認し、終わったら報告を受け取ります。

## 🔗 リンク

[紹介サイト](https://engchoon.github.io/ai-office/) · [不具合・ご意見を送る](https://github.com/EngChooN/ai-office/issues/new) · [すべてのリリース](https://github.com/EngChooN/ai-office/releases/latest) · [更新情報](CHANGELOG.ja.md) · [支援する](https://fairy.hada.io/@ai-office)

---

## プロジェクトについて

Claude の社員と GPT の社員を一緒に**採用**し、ひとつのオフィスのように仕事を任せ、承認し、報告を受ける無料・オープンソースのデスクトップアプリ（Electron）です。社員は Claude Code または Codex（GPT）のセッションです。旧名称は Claude Office で、初回起動時に既存データを自動コピーします（旧フォルダーはそのまま残ります）。

## インストール前にお読みください

**Mac**
- 上のボタンでダウンロードした `.dmg` を開き、Applications にドラッグします。
- Apple Silicon 専用で、署名・公証はありません。初回起動時に「開発元を確認できない」と表示されたら、システム設定 › プライバシーとセキュリティ › 「このまま開く」を押してください。

**Windows**
- `AI-Office-win-x64-Setup.exe` をダウンロードして実行すると、ユーザーフォルダーにインストールされ、スタートメニューとデスクトップにショートカットができます（管理者権限は不要）。更新はアプリ内から行います。
- 署名がないため、初回起動時に SmartScreen の「Windows によって PC が保護されました」が表示されたら、「詳細情報 › 実行」を押してください。
- 以前 zip を展開して使っていた方は、Setup.exe でインストールしてから旧フォルダーを削除してください（設定と履歴は引き継がれます）。
- データは `%APPDATA%\AI Office\office.db` にあります。
- まだ Mac のみ: アプリの外で起動した社員の通知・質問の受け取り（hooks）、画面キャプチャ。作業結果のレビュー（コミット・PR）には Git for Windows と GitHub CLI が必要で、実機での確認はまだです。

**共通の必要条件**
- そのパソコンで Claude（Claude Code）または GPT（ChatGPT・Codex）のどちらか1つ以上にログインしていること。両方つなぐと社員ごとに選べます。社員はそのアカウントで働き、料金もそのアカウントに請求されます。

## スマホ接続

- 設定 › スマホ接続でオンにし、QR コードで Android アプリをつなぎます。**初期設定はオフ**です。オンにすると Tailscale のアドレス経由のみで接続する方式が基本で、同じネットワークのみ・ルーターのポートフォワーディングも選べます。ポートフォワーディングはこの PC のポート（既定 47900）がインターネット側に開くため、使わないときはオフにしてください。
- スマホからの承認・指示は、PC で直接行うのと同じ権限を持ちます。スマホを紛失したら「QR を作り直す」を押してください。
- 通知は 15 分ほどごとに確認する方式のため、数十分遅れることがあります。PC のリモート鍵が変わったら、QR を作り直して接続し直してください。
- スマホアプリは PC と同じバージョンを使ってください。アプリのビルド・署名フィンガープリントは `android/README.md` にあります。

## 開発者向け

```bash
cd app
pnpm install
pnpm start
```

- スタック: Electron Forge + Vite · React 19 · Zustand · Tailwind 4 + shadcn/ui · Phaser 4 · SQLite（`node:sqlite`）· Claude Agent SDK · Codex app-server（GPT 社員）
- ログイン: 別の API キーは不要で、このパソコンの Claude Code・Codex のログインをそのまま使います。接続状態は設定でプロバイダーごとに確認できます。
- データ: Mac は `~/Library/Application Support/AI Office/office.db`
- 1つのデータフォルダーは1つのアプリだけが使えます（`office.lock`）。インストール版が起動中だと、開発アプリは「すでに起動しています」と表示して終了します。インストール版を起動したまま開発アプリや QA を動かすには、別のフォルダーを指定します: `AI_OFFICE_USER_DATA=~/ai-office-dev pnpm start`（旧名 `CLAUDE_OFFICE_USER_DATA` も認識します）
- Mac 用インストーラーの作成: `cd app && pnpm make` → `app/out/make/dmg/arm64/AI-Office.dmg`
- Windows 用インストーラーの作成: `cd app && pnpm install && pnpm make:win` → `app/out/make/squirrel.windows/x64/AI-Office-win-x64-Setup.exe`。Mac には wine がないため、GitHub Actions の `win-installer` で作成します。Mac でも `pnpm-workspace.yaml` の `supportedArchitectures` で Windows x64 用の claude 実行ファイルのパッケージを取得できます（設定を変えたあと `pnpm install` を1回）。
- フォルダー: `app/`（アプリ: `src/main` メインプロセス、`src/renderer` 画面、`src/shared` 共有型）· `android/`（スマホアプリ）· `site/`（紹介サイト）· `docs/`（仕様・調査記録）
- ドキュメント: [CONTEXT.md](CONTEXT.md)（初めて見る人向けの背景、社員の2種類の説明を含む）· [intro.html](intro.html)（紹介スライド）· [SPEC.md](SPEC.md)（決定済み仕様）· [CHANGELOG.ja.md](CHANGELOG.ja.md)（変更履歴）
