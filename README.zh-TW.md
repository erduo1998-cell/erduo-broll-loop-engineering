<div align="center">

# Erduo B-roll Loop Engineering

**把 SRT 與可選的已剪輯口播影片交給 Codex 或 Claude Code，製作可編輯、可複查的 B-roll Master。**

[简体中文](README.md) · [English](README.en.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · **繁體中文**

[真實成片](#真實成片示範) · [安裝](#安裝) · [第一次使用](#第一次使用) · [已驗證範圍](#已驗證範圍)

</div>

## 真實成片示範

<p align="center">
  <img src="https://raw.githubusercontent.com/erduo1998-cell/erduo-broll-loop-engineering/main/docs/images/demos/infinite-canvas-pipeline.gif" alt="在同一無限畫布中從 SRT 時間錨點移動到批准後 4K Master 的連續動畫" width="100%">
</p>

這段畫面來自同輸入的 v0.7.0 first-pass benchmark。完整預覽為 14.1 秒、2160 × 3840、30 fps；兩份比較預覽通過技術檢查後，使用者選擇了 v0.7.0。這只是單一凍結樣本的結果，不保證所有輸入都能得到相同美感，也不表示兩個渲染後端的視覺完全一致。

## 它能做什麼

- 以 SRT 的整數毫秒為時間基準，按語意而不是每行字幕設計鏡頭。
- 實作前先凍結共用視覺系統與精簡 Shot Recipe。
- 依專案證據，把完整鏡頭區塊分配給 HyperFrames、Remotion 或凍結媒體 hybrid 路線。
- 優先使用你提供的媒體，只在鏡頭確實需要時取得額外素材。
- 完整預覽出現後等待批准，批准後才正式渲染並驗證 4K Master。

<p align="center">
  <img src="https://raw.githubusercontent.com/erduo1998-cell/erduo-broll-loop-engineering/main/docs/images/demos/quick-start.gif" alt="從 SRT 到批准後 4K Master 的操作流程" width="100%">
</p>

## 安裝

需要：macOS、Node.js 20 或以上、FFmpeg/FFprobe，以及 Codex 或 Claude Code。

```bash
git clone https://github.com/erduo1998-cell/erduo-broll-loop-engineering.git
cd erduo-broll-loop-engineering
./Install.command
```

安裝後重新啟動宿主。安裝器會配置鎖定版本的 HyperFrames 環境與 13 個階段 Skill，不會使用 `sudo`、修改 shell 設定或全域安裝 Remotion。

## 第一次使用

附上 SRT，然後輸入：

```text
使用 erduo-broll-loop-engineering，把這份 SRT 做成無人出鏡 B-roll Master。
持續自動執行，直到完整預覽需要我批准時再停下。
```

口播模式還需要與字幕匹配的已剪輯影片。若有圖片、影片、Logo 或螢幕截圖，請在開始時一併提供。

## 語言支援

UTF-8 SRT 輸入不限定中文。實際語言品質取決於宿主模型對該語種的理解，以及專案字型是否覆蓋所需字形。預設 B-roll Master 不會燒錄整段字幕。

## 已驗證範圍

- 已驗證 macOS 上的 Codex 與 Claude Code。
- 預設交付：H.264 MP4、3840 × 2160、30 fps。
- HyperFrames 與 Remotion 是獨立後端，不承諾視覺一致。
- Windows、桌面版 CapCut/Jianying 匯入，以及任意現有專案的自動修復尚未驗證。
- 完整技術契約與疑難排解請見[簡體中文 README](README.md)。

授權：[MIT](LICENSE) · 支援細節：[SUPPORT-MATRIX.md](SUPPORT-MATRIX.md) · 貢獻：[CONTRIBUTING.md](CONTRIBUTING.md)
