# PictoFlow 引き継ぎメモ（Claude Code向け）

## プロジェクト概要
- **プロダクト名**: PictoFlow
- **URL**: https://pictoflow.vercel.app/app.html
- **GitHub**: https://github.com/todaytaro/pictoflow
- **オーナー**: きょう（@kyo_builds）

## 技術スタック
- Frontend: HTML/CSS/JS（Vanilla）
- Backend: Vercel Serverless Functions
- 画像生成: Replicate API
- デプロイ: Vercel（GitHub連携、自動デプロイ）

## 環境変数（Vercelに設定済み）
- `REPLICATE_API_TOKEN` — Replicate API
- `REMOVE_BG_API_KEY` — Remove.bg API（現在未使用）

## 現在のファイル構成
```
pictoflow/
├── api/
│   ├── generate.js     ← プロンプト→flux-schnell生成（ポーリング方式に変更済み）
│   ├── kontext.js      ← flux-kontext-pro（パラメータはReplicateドキュメントと一致を確認済み・実機テスト未）
│   └── remove-bg.js    ← remove.bg API（REMOVE_BG_API_KEYが未設定なら500を返す）
├── app.html            ← メインアプリUI
├── index.html          ← LP
└── vercel.json         ← ルーティング設定
```

> 旧 `api/upload.js` と `api/token.js` は削除済み。

## 現在の動作状況

### 動作確認済み
- `プロンプト生成`タブ → flux-schnellで画像生成 → 正常動作
- `起点から派生`タブ → UI実装済み・kontext.js実装済み・未テスト

### 問題あり（未解決）
- `商品写真で生成`タブ → Briaモデルへの画像アップロードが失敗中
  - 原因: ReplicateのFiles APIが`{"detail":"Missing content"}`を返す
  - 試したこと: base64送信、multipart手動パース、全部400エラー
  - **根本原因**: VercelのServerless FunctionでバイナリをReplicateのFiles APIに送る方法が未解決

## 最優先タスク

### 1. プロンプト生成の500エラーを解消する
**対応済み（2026-04-26）**: `Prefer: wait=60` を外し、Replicateの作成APIは即座にpredictionIdだけ返すようにし、
`maxDuration=60`の関数内で長時間ブロッキングしないよう、クライアント主導のポーリング方式に変更。
Replicate側のエラー（422など）は500ではなく適切なステータスで返すようにし、ログにstatus/idを残すようにした。
クライアント (`app.html` の `genPrompt`) もポーリング対応済み。

依然として500が出る場合の確認:
```bash
# Vercelのログで確認
# https://vercel.com/oobakyoutarou-4323s-projects/pictoflow/logs
```

### 2. 起点から派生（flux-kontext-pro）をテストする
`api/kontext.js`が実装済み。`app.html`にも「起点から派生」タブが追加済み。

**使い方**:
1. プロンプト生成で画像を1枚作る
2. 生成結果の「起点に」ボタンを押す
3. 「起点から派生」タブで編集指示を入力して生成

**kontext.jsのAPIパラメータ**（確認済み）:
```js
// 公式ドキュメント (https://replicate.com/black-forest-labs/flux-kontext-pro/api) と一致
input: {
  prompt,
  input_image: imageUrl,   // ← パラメータ名OK
  output_format: 'png',
  output_quality: 90,      // pngでは無視されるが残しても無害
  safety_tolerance: 2,     // 0〜6の範囲内
}
```

### 3. 商品写真→背景生成の問題解決（後回し可）
Briaモデルへの画像アップロード問題。
Files APIのバイナリ送信がVercelで動かない。

**解決策候補**:
- Option A: Cloudinaryの無料プランを使って画像URLを取得してからBriaに渡す
- Option B: Briaを諦めてflux-kontextで背景差し替えを実現する（推奨）
  - 商品写真をプロンプト生成の「起点画像」として使えば同じことができる
  - ただし商品写真を公開URLにする必要がある

## プロダクトビジョン（重要）

### 再定義されたコアバリュー
「気に入った1枚を起点に、派生・修正・量産できる」

### ターゲット
- 第1フェーズ: AI画像生成クリエイター（きょう自身がユーザー）
- 第2フェーズ: EC事業者

### なぜこの方向か
きょうさんの実体験ペイン:
「一回お気に入りの画像が完成した。少し修正したい、または起点に他の画像を作りたいのに、作業が複雑で断念してしまう」

これはCanvaにもAdobeにもできない。flux-kontext-proで実現できる。

## app.htmlのタブ構成（現在）
1. **プロンプト生成** — 動作確認済み
2. **商品写真で生成** — 問題あり（後回し可）
3. **起点から派生** — 実装済み・未テスト ← 最優先でテストすべき

## vercel.json
```json
{
  "version": 2,
  "routes": [
    { "src": "/api/(.*)", "dest": "/api/$1" },
    { "src": "/app", "dest": "/app.html" },
    { "src": "/app.html", "dest": "/app.html" },
    { "src": "/(.*)", "dest": "/index.html" }
  ]
}
```

## Claude Codeへのお願い（更新: 2026-04-26）
1. ~~まずGitHubのコードを読んで現状を把握してください~~ — 完了
2. ~~`api/generate.js`の500エラーの原因を特定してください~~ — `Prefer: wait` ベースの構成がmaxDurationと競合していた可能性が高いため、ポーリング方式に変更済み
3. ~~`api/kontext.js`のパラメータをReplicateのドキュメントと照合して修正してください~~ — 公式ドキュメントと一致を確認、修正不要
4. **未完了**: 「起点から派生」機能をVercel本番でテストして動作確認してください
5. ~~不要なファイル（`api/token.js`, `api/upload.js`）は削除してください~~ — 既に削除済み（コミット `46b70df`, `b3d3b9f`）
