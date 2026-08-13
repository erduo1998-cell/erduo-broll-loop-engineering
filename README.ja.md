<div align="center">

# Erduo B-roll Loop Engineering

**SRT と任意の編集済みトーキングヘッド動画から、編集・確認可能な B-roll Master を Codex / Claude Code で制作します。**

[简体中文](README.md) · [English](README.en.md) · **日本語** · [한국어](README.ko.md) · [繁體中文](README.zh-TW.md)

[実例](#実際の出力例) · [インストール](#インストール) · [最初の実行](#最初の実行) · [確認済み範囲](#確認済み範囲)

</div>

## 実際の出力例

<p align="center">
  <img src="https://raw.githubusercontent.com/erduo1998-cell/erduo-broll-loop-engineering/main/docs/images/demos/relationship-proof.gif" alt="v0.7.0 の検証済み first-pass B-roll ベンチマーク" width="360">
</p>

この映像は、同一入力による v0.7.0 first-pass ベンチマークの一部です。全体は 14.1 秒、2160 × 3840、30 fps。両方の比較プレビューが技術検査を通過した後、ユーザーが v0.7.0 を選択しました。これは固定された 1 サンプルの結果であり、すべての入力や両バックエンドの見た目が同一になる保証ではありません。

## できること

- SRT の整数ミリ秒を基準に、字幕 1 行ごとではなく意味単位でショットを設計。
- 実装前に共通ビジュアルシステムとコンパクトな Shot Recipe を固定。
- プロジェクトの実証情報に基づき、HyperFrames、Remotion、または凍結メディアによる hybrid へショット区間を割り当て。
- 提供素材を優先し、必要なショットだけ追加素材を取得。
- 全体プレビューで承認を待ち、承認後に 4K Master を正式レンダリングして技術検証。

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
- HyperFrames と Remotion は独立したバックエンドで、視覚的一致は保証しません。
- Windows、デスクトップ版 CapCut/Jianying への取り込み、任意の既存プロジェクトの自動修復は未検証です。
- 完全な技術契約とトラブルシューティングは[簡体字中国語 README](README.md)を参照してください。

ライセンス：[MIT](LICENSE) · 対応範囲：[SUPPORT-MATRIX.md](SUPPORT-MATRIX.md) · コントリビューション：[CONTRIBUTING.md](CONTRIBUTING.md)
