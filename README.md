# Sheet Up

Tauri + React 製のローカルファーストなスプレッドシートアプリです。  
Obsidian ライクなフォルダ構造でシートを管理し、JSON ストレージをそのまま AI やスクリプトに流し込めることを目指しています。

## セットアップ

```bash
# 依存パッケージのインストール
bun install

# デスクトップアプリを起動
bun run tauri dev
```

初回起動時は空の状態で立ち上がります。`ワークスペースを開く` ボタンからワークスペースフォルダ（例: `/path/to/workspace`）を選択してください。

### 必要なランタイム
- Bun
- Rust toolchain（`mise` を使って `rust` と `bun` を揃えています）
- Tauri 2 がサポートする各 OS のビルド依存関係  
  （macOS: Xcode Command Line Tools / Windows: MSVC + WebView2 / Linux: WebKit など）

## ワークスペース構造

```
workspace.json
books/
  └─ book-001.json
thumbs/         # 任意
```

- `workspace.json` にはフォルダ・ブックの一覧とメタ情報を保存します。
- 各ブックの実データは `books/{bookId}.json` に保存します。
- `workspace.json` の `books[].dataPath` でブックファイルへの相対パスを指定します。

アプリからワークスペースを開くと、`workspace.json` と参照されるブックファイルをまとめて読み込みます。保存ボタンまたは自動保存により同じファイルへ書き戻されます。

## アプリの操作

- `ワークスペースを開く`: ワークスペースフォルダを選択して読み込みます。
- `保存`: 編集内容をすべての JSON ファイルへ書き戻します。
- `自動保存`: デフォルトで有効（Tauri 実行時のみ）になっており、変更が検知されると短い遅延の後に保存します。
- ブラウザプレビュー（`bun run dev`）ではファイルシステムへアクセスできないため、サンプルデータ表示のみになります。

## 開発向けスクリプト

```bash
# サンプルデータが JSON Schema を満たすかを検証
bun run validate:schema

# ローカルにワークスペース/ブックを作成して I/O をお試し
bun run demo:io
bun run demo:workspace
```

## 今後の予定（抜粋）

- ブック/シートの CRUD やドラッグ＆ドロップを含むサイドバー強化
- セル編集・Undo/Redo・コピー＆ペースト対応
- ショートカットやテーマ切り替えなどの操作性向上
- 自動テストおよびドキュメント整備による初回リリース準備
