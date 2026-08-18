<div align="center">

# Erduo B-roll Loop Engineering

**完全な original SRT と design、および任意の編集済みトーキングヘッド動画から、編集可能な source、直接レンダリングした shot、確認用 preview を制作します。**

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
- production は HyperFrames が標準。Remotion は明示指定/canary のみ、`auto` は実験的 opt-in。
- 提供素材を優先し、必要なショットだけ追加素材を取得。
- 量産前に Lead の三種類の最終 sample と、ユーザーが選ぶ 5-shot canary を提示。各 shot を直接レンダリングし、6 コマ画像と全体 preview を生成。

## v1.0.1：Chapter Builder の創作ループを復元

v1.0.1 は正式公開済みです。意味 shot は引き続き独立 H.264 のメディア境界ですが、通常 5–8 個の連続 shot を一人の Chapter Builder が担当します。完全な original SRT/design を直接読み、`truth` は変更せず、`creativeProposal` は短い理由付きで変更でき、章全体の構図・素材・テンポ・接続を所有します。

Assets は既知の共有素材/フォントだけを凍結し、shot 固有の `search`、`generate`、`mixed` を閉じません。Lead は native graphic/type、実写または生成素材の fusion、情報密度の高い interface/process/data の三種類の最終 sample と、signature motion、素材融合能力、短い能力 index を作ります。Builder は実際の 6 コマ画像と chapter preview を開き、欠陥を修正して `accepted` または `revised` を返します。

production source から `inspection.tsx`、DOM trace marker、手動 motion window、成功時の dense diagnostics を削除します。Parent は render/decode/hash/contract/sheet/preview の機械処理だけを担当します。十二原則は短い正向 anchor とし、shot ごとに関連する 2–4 個の `craftIntent` のみ選び、採点や proof は行いません。

production 標準は HyperFrames。Remotion は明示 opt-in/canary のみ、`auto` は実験的 opt-in です。5-shot canary が direct delivery、Builder の実視聴、構図/素材/signature motion の多様性、ユーザー選択 3/5 以上、初回 preview ≤45 分を満たすまで全編制作を開始しません。

2026-08-18 の 179.866 秒 Remotion run は失敗証拠として残します。20/20 の media contract/decode は通過しましたが、20 creative units、original design 不達、素材不足、技術 inspection 合格でも視覚品質不合格でした。203m13s / 54m17s / 63m13s も目標未達であり、本修正や backend 同等性を証明しません。

## v1.0.0 量産前の Visual Lock

- Director の意味ショットは通常約 5–12 秒。Runtime Plan v3 は短いショットと Builder unit を別々に計画し、通常の約 180 秒・単一 backend では 2–3 Builder を目標にしますが、強制数ではありません。
- Lead Builder が opening、情報密度の高い区間、後半の 3 シーンと、実際に使う backend ごとの共有 visual source を先に作ります。ユーザーが承認、修正、または明示的 skip を選ぶまで残りの Builder は展開しません。
- 通常の単一 backend unit は高品質 H.264 MP4（`libx264 / medium / CRF 12`）が標準です。FFV1 は Hybrid、透明、実際の lossless 交換が必要な場合だけ、理由付きで明示的に選択します。
- motion/layout は beat 境界、readable hold、cut、必要な sampling を先に検査し、異常区間や精密な diagram/path だけ dense trace へ進みます。正常時に全編の frame PNG は作りません。
- 公開安全な production metrics は時間、Agent 呼び出し、unit、ファイル/byte、render/trace/decode/hash、失敗/再試行、任意の host token 事実を記録します。token が取れない場合は推定せず unknown とします。

[v1.0.0 公開 production benchmark](docs/V1.0.0-BENCHMARK.md)では、同じ 179.866 秒の SRT を Codex で実制作しました。Shot Recipe v3 は 20 件、Lead 1 名 + production Builder 3 名、Agent 呼び出し 10 回、full-history 呼び出し 0 回、外部素材 0 件、全 213 ファイル、disk usage は 156,980 KiB です。preview と Master は full decode に合格しました。Director 開始から最初の preview までは約 242.05 分で 120 分目標未達、Lead は 62.90 分で 45 分目標未達でした。Director の visual-lock 拒否 1 回は定点修正後に再検査を通過しましたが、ユーザーは視聴も審美承認もしていないため状態は `skipped` です。host token は unknown、音声同期は未検証、Claude Code の同一入力比較は pending です。

## v0.9.2 制作能力はそのまま、インストールを明確化

v0.9.2 は配布形式とインストール入口だけを変更します。Director、Assets、複数 Builder、152 枚のカード、8 種類の図解 grammar、ランタイム選択、プレビュー承認、納品契約は v0.9.1 と同一です。

## v0.9.1 Creative Production と読みやすい図解

- Director、Assets、複数の担当 Builder という創作分担を維持します。固定テンプレートへ縮小せず、構図、比喩、動きの複雑さを制限しません。
- Parent が backend 計画、タスク配布、検査、clip 結合、preview 準備の決定的な script を直接実行し、Runtime Planner / Integrator / Render Agent は起動しません。同一制作では素材と同一依存環境を共有し、完全な project を重複コピーしません。
- 各 Builder は編集可能な source と、共通仕様で検証済みの video clip を納品します。script は clip を結合しますが、任意の HyperFrames / Remotion source を理解・統合できるとは主張しません。
- 全体 preview は最大 1080p、`veryfast / CRF 22` で生成します。承認 identity は runtime plan、narrative envelope、visual system、全 shot contract、実際の clip hash に結び付けます。
- 納品時は `--plan`、`--narrative-envelope`、`--visual-system`、全 `--contract` を再指定します。identity を再確認し、凍結 clip から完全仕様の `medium / CRF 16` Master を作成します。preview のコピーは使用しません。
- 口頭内容の意味と感情の進行を animation beat に変換します。主体、空間、階層、関係または視覚的焦点を実際に発展させ、装飾的な loop を主 animation の代わりにしません。
- 発話が process、因果、時間順序、階層、feedback、依存、system route、同一基準の比較を説明する場合だけ、Director は 8 種類の軽量 diagram grammar から 1 つを選べます。使用数のノルマ、外部 Skill 全体の読み込み、固定 visual skin はありません。
- Builder は映像全体の visual system に合わせて空間、素材、animation を自由に設計します。script は実際の render geometry から、無関係な node を横切る connector、label と path/node の接触、connector path の重複、canvas 外への逸脱だけを検出し、図解の style は採点しません。
- 修正は元の担当 Builder にだけ戻し、各 Builder に制作履歴全体を渡しません。

検査は計画された発展の不足や、測定可能な motion/layout リスクを検出できます。ただし animation の高度さや美的価値は判断できません。Visual lock は量産、全体動画 preview は納品を判断します。backend 間の見た目の一致は保証しません。

<p align="center">
  <img src="https://raw.githubusercontent.com/erduo1998-cell/erduo-broll-loop-engineering/main/docs/images/demos/quick-start.gif" alt="SRT から承認済み 4K Master までの操作フロー" width="100%">
</p>

## インストール

### 標準 Skill インストール

固定 HyperFrames 環境がすでに準備済みの端末向けです。v1.0.1 Release の `erduo-broll-loop-engineering-skills-v1.0.1.tar.gz` を展開し、次を実行します。

```bash
npx -y skills@1.5.22 add ./erduo-broll-loop-engineering-skills-1.0.1 --skill '*' --agent codex --global --full-depth
# Claude Code では codex を claude-code に変更
```

この方法は 14 個のプロジェクト Skill のみを登録し、Node、ブラウザ、FFmpeg は準備しません。不足がある場合は処理を停止し、次の完全環境インストールを使用します。

### 完全環境インストール

必要環境：macOS、Node.js 22.20 以上、FFmpeg/FFprobe、Codex または Claude Code。

```bash
git clone https://github.com/erduo1998-cell/erduo-broll-loop-engineering.git
cd erduo-broll-loop-engineering
./Install.command
```

インストール後にホストを再起動してください。インストーラーは固定済み HyperFrames 環境と 13 個の Stage Skill を導入します。`sudo`、シェル設定の変更、Remotion のグローバルインストールは行いません。

## 最初の実行

完全な original SRT と design を添付して次のように依頼します。

```text
erduo-broll-loop-engineering を使って、この original SRT と design から編集可能な B-roll shot ファイルと全体 preview を作成してください。全編 Master は私が明示的に求めた場合だけ作成してください。
5-shot canary までは自動実行し、その後は shot ごとの選択のため停止してください。5 件中 3 件以上で本版を選ぶまで全編 production を開始せず、最終 preview の納品承認でも停止してください。
```

トーキングヘッドモードでは、字幕に対応する編集済み動画も必要です。画像、動画、ロゴ、スクリーンショットがある場合は最初に渡してください。

## 言語対応

UTF-8 SRT は中国語に限定されません。実際の品質はホストモデルの言語理解と、使用フォントが必要な文字を収録しているかに依存します。標準の B-roll Master に全文字幕は焼き込みません。

## 確認済み範囲

- macOS の Codex で v1.0.0 production benchmark を完了。Claude Code はインストール/契約を確認済みですが、同一入力の v1 production 比較は pending です。
- v1.0.1 の標準出力：runtime source から直接レンダリングした順序付き H.264 shot、3840 × 2160、30 fps。全編 Master は任意です。
- 同一入力の新しい 5-shot HyperFrames canary は、直接 render、full decode、閲覧 receipt、構図・素材・signature motion の gate を通過しました。ユーザーは結果を承認し、残りの shot と全編 preview を制作せず公開することを明示しました。そのため全編 production や両 backend の同等対応は主張しません。
- 出力ポリシーは手書きせず、`create-production-profile.mjs` で生成します。Parent はそのファイルを必ず `plan-runtime.mjs --production-profile` に渡し、幅、高さ、fps、音声、H.264 MP4 の条件を計画、各 Builder の割り当て、納品検証へ同じハッシュで固定します。たとえば `--width 1080 --height 1920 --fps 25 --audio silent --master-format h264-mp4` は、標準値へ戻らない縦型 25 fps のプロファイルを生成します。
- HyperFrames と Remotion は独立したバックエンドで、視覚的一致は保証しません。
- Windows、デスクトップ版 CapCut/Jianying への取り込み、任意の既存プロジェクトの自動修復は未検証です。
- 完全な技術契約とトラブルシューティングは[簡体字中国語 README](README.md)を参照してください。

ライセンス：[MIT](LICENSE) · 対応範囲：[SUPPORT-MATRIX.md](SUPPORT-MATRIX.md) · コントリビューション：[CONTRIBUTING.md](CONTRIBUTING.md)
