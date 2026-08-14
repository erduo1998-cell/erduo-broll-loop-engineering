<div align="center">

# Erduo B-roll Loop Engineering

**SRT と任意の編集済みトーキングヘッド動画から、編集・確認可能な B-roll Master を Codex / Claude Code で制作します。**

[简体中文](README.md) · [English](README.en.md) · **日本語** · [한국어](README.ko.md) · [繁體中文](README.zh-TW.md)

[実例](#実際の出力例) · [インストール](#インストール) · [最初の実行](#最初の実行) · [確認済み範囲](#確認済み範囲)

</div>

## 実際の出力例

<p align="center">
  <img src="https://raw.githubusercontent.com/erduo1998-cell/erduo-broll-loop-engineering/main/docs/images/demos/infinite-canvas-pipeline.gif" alt="SRT の時間固定から承認済み 4K Master までを一つの無限キャンバスで移動する映像" width="100%">
</p>

この映像は、同一入力による v0.7.0 first-pass ベンチマークの一部です。全体は 14.1 秒、2160 × 3840、30 fps。両方の比較プレビューが技術検査を通過した後、ユーザーが v0.7.0 を選択しました。これは固定された 1 サンプルの結果であり、すべての入力や両バックエンドの見た目が同一になる保証ではありません。

## できること

- SRT の整数ミリ秒を基準に、字幕 1 行ごとではなく意味単位でショットを設計。
- 実装前に共通ビジュアルシステムとコンパクトな Shot Recipe を固定。
- プロジェクトの実証情報に基づき、HyperFrames、Remotion、または凍結メディアによる hybrid へショット区間を割り当て。
- 提供素材を優先し、必要なショットだけ追加素材を取得。
- 全体プレビューで承認を待ち、承認後に 4K Master を正式レンダリングして技術検証。

## v0.9 Creative Production

- Director、Assets、複数の担当 Builder という創作分担を維持します。固定テンプレートへ縮小せず、構図、比喩、動きの複雑さを制限しません。
- Parent が backend 計画、タスク配布、検査、clip 結合、preview 準備の決定的な script を直接実行し、Runtime Planner / Integrator / Render Agent は起動しません。同一制作では素材と同一依存環境を共有し、完全な project を重複コピーしません。
- 各 Builder は編集可能な source と、共通仕様で検証済みの video clip を納品します。script は clip を結合しますが、任意の HyperFrames / Remotion source を理解・統合できるとは主張しません。
- 全体 preview は最大 1080p、`veryfast / CRF 22` で生成します。承認 identity は runtime plan、narrative envelope、visual system、全 shot contract、実際の clip hash に結び付けます。
- 納品時は `--plan`、`--narrative-envelope`、`--visual-system`、全 `--contract` を再指定します。identity を再確認し、凍結 clip から完全仕様の `medium / CRF 16` Master を作成します。preview のコピーは使用しません。
- 口頭内容の意味と感情の進行を animation beat に変換します。主体、空間、階層、関係または視覚的焦点を実際に発展させ、装飾的な loop を主 animation の代わりにしません。
- 修正は元の担当 Builder にだけ戻し、各 Builder に制作履歴全体を渡しません。

検査は計画された発展の不足や、測定可能な motion/layout リスクを検出できます。ただし animation の高度さや美的価値は判断できません。最終判断は一度だけの全体動画 preview です。backend 間の見た目の一致は保証しません。

<p align="center">
  <img src="https://raw.githubusercontent.com/erduo1998-cell/erduo-broll-loop-engineering/main/docs/images/demos/quick-start.gif" alt="SRT から承認済み 4K Master までの操作フロー" width="100%">
</p>

## インストール

必要環境：macOS、Node.js 20 以上、FFmpeg/FFprobe、Codex または Claude Code。

```bash
git clone https://github.com/erduo1998-cell/erduo-broll-loop-engineering.git
cd erduo-broll-loop-engineering
./Install.command
```

インストール後にホストを再起動してください。インストーラーは固定済み HyperFrames 環境と 13 個の Stage Skill を導入します。`sudo`、シェル設定の変更、Remotion のグローバルインストールは行いません。

## 最初の実行

SRT を添付して次のように依頼します。

```text
erduo-broll-loop-engineering を使って、この SRT から人物が映らない B-roll Master を作成してください。
全体プレビューで私の承認が必要になるまで、自動で続行してください。
```

トーキングヘッドモードでは、字幕に対応する編集済み動画も必要です。画像、動画、ロゴ、スクリーンショットがある場合は最初に渡してください。

## 言語対応

UTF-8 SRT は中国語に限定されません。実際の品質はホストモデルの言語理解と、使用フォントが必要な文字を収録しているかに依存します。標準の B-roll Master に全文字幕は焼き込みません。

## 確認済み範囲

- macOS 上の Codex と Claude Code を確認済み。
- 標準出力：H.264 MP4、3840 × 2160、30 fps。
- 出力ポリシーは手書きせず、`create-production-profile.mjs` で生成します。Parent はそのファイルを必ず `plan-runtime.mjs --production-profile` に渡し、幅、高さ、fps、音声、H.264 MP4 の条件を計画、各 Builder の割り当て、納品検証へ同じハッシュで固定します。たとえば `--width 1080 --height 1920 --fps 25 --audio silent --master-format h264-mp4` は、標準値へ戻らない縦型 25 fps のプロファイルを生成します。
- HyperFrames と Remotion は独立したバックエンドで、視覚的一致は保証しません。
- Windows、デスクトップ版 CapCut/Jianying への取り込み、任意の既存プロジェクトの自動修復は未検証です。
- 完全な技術契約とトラブルシューティングは[簡体字中国語 README](README.md)を参照してください。

ライセンス：[MIT](LICENSE) · 対応範囲：[SUPPORT-MATRIX.md](SUPPORT-MATRIX.md) · コントリビューション：[CONTRIBUTING.md](CONTRIBUTING.md)
