[English](README.md) · [한국어](README.ko.md) · [日本語](README.ja.md) · [中文](README.zh.md)

# AI Office

AI セッション（現在は Claude Code）を**社員**として採用し、ひとつのオフィスのように見て指示できる個人向け PoC（Electron デスクトップアプリ）です。旧名称は Claude Office で、初回起動時に既存データを自動コピーします（旧フォルダーはそのまま残ります）。

- 状態: **0.13.2**（2026-10-27）— オフィスマップ（チームエリア・会議室・休憩室）· チーム／チームリーダーへの委任 · タスクボード · 承認箱 · グループチャット · 会議 · 予約タスク · レポート · 給与明細 · 模様替え
- スタック: Electron Forge + Vite · React 19 · Zustand · Tailwind 4 + shadcn/ui · Phaser 4 · SQLite（`node:sqlite`）· Claude Agent SDK

## インストール (0.13.2)
- `app/out/make/dmg/arm64/AI Office.dmg` を開き、Applications にドラッグします
- Apple Silicon 専用 · 署名・公証なし → 初回起動時に「開発元を確認できない」と表示されたら、システム設定 › プライバシーとセキュリティ › 「このまま開く」
- 必要条件: その Mac で Claude Code にログインしていること（社員はそのアカウントで働き、料金もそのアカウントに請求されます）
- 再ビルド: `cd app && pnpm make`

## Windows（第1弾 · 試験版）
- ビルド: `cd app && pnpm install && pnpm make:win` → `app/out/make/zip/win32/x64/*.zip`（インストールせずに展開して `claude-office.exe` を実行）
  - Mac でビルドしても構いません。`pnpm-workspace.yaml` の `supportedArchitectures` により、Windows x64 用の claude 実行ファイルパッケージも取得されます（設定を変えたあと `pnpm install` を一度実行してください）
- 署名なし → 初回起動時に SmartScreen の「Windows によって PC が保護されました」が出たら「詳細情報 › 実行」
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
- ログイン: 別途 API キーは不要で、この Mac の Claude Code のログインをそのまま使います。
- データ: `~/Library/Application Support/AI Office/office.db`
- 1つのデータフォルダは1つのアプリだけが使います（`office.lock`）。インストール版が起動していると、開発版は「すでに起動しています」と表示して終了します。インストール版を起動したまま開発版や QA を動かすには、別のフォルダを指定します: `CLAUDE_OFFICE_USER_DATA=~/claude-office-dev pnpm start`

## 社員の2種類
| | 雇用社員 | 外部社員 |
|---|---|---|
| 正体 | アプリが Agent SDK で起動したセッション | ターミナル・デスクトップアプリで既に実行中のセッション |
| 状態 | リアルタイム（ストリーム） | `~/.claude/sessions` レジストリを2秒ごとにポーリング（+ オプトインの hooks） |
| 指示・承認 | アプリで | 元のウィンドウで |
| 今日の作業 | アプリ DB | トランスクリプト jsonl |

## フォルダ
- `app/` — アプリ（`src/main` メインプロセス、`src/renderer` 画面、`src/shared` 共通の型）
- `spikes/` — 第1段階の連携検証スクリプト
- `docs/` — 調査・スパイクの記録

## ドキュメント
- [CONTEXT.md](CONTEXT.md) — 初めて見る人のための背景資料 · [intro.html](intro.html) — 紹介スライド（ブラウザで開く） · [SPEC.md](SPEC.md) — 決定済みの仕様 · [CHANGELOG.ja.md](CHANGELOG.ja.md) — 変更履歴 · [docs/spike-integration.md](docs/spike-integration.md)
