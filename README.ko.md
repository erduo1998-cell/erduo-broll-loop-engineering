<div align="center">

# Erduo B-roll Loop Engineering

**SRT와 선택적인 편집 완료 토킹헤드 영상을 Codex 또는 Claude Code로 편집·검토 가능한 B-roll Master로 만듭니다.**

[简体中文](README.md) · [English](README.en.md) · [日本語](README.ja.md) · **한국어** · [繁體中文](README.zh-TW.md)

[실제 결과](#실제-출력-예시) · [설치](#설치) · [첫 실행](#첫-실행) · [검증 범위](#검증-범위)

</div>

## 실제 출력 예시

<p align="center">
  <img src="https://raw.githubusercontent.com/erduo1998-cell/erduo-broll-loop-engineering/main/docs/images/demos/infinite-canvas-pipeline.gif" alt="SRT 시간 고정부터 승인된 4K Master까지 하나의 무한 캔버스를 이동하는 영상" width="100%">
</p>

이 영상은 동일 입력으로 진행한 v0.7.0 first-pass 벤치마크의 일부입니다. 전체 길이는 14.1초, 해상도는 2160 × 3840, 프레임률은 30 fps입니다. 두 비교 프리뷰가 기술 검사를 통과한 뒤 사용자가 v0.7.0을 선택했습니다. 하나의 고정 샘플 결과일 뿐, 모든 입력이나 두 렌더링 백엔드의 시각적 결과가 같다는 보장은 아닙니다.

## 주요 기능

- SRT의 정수 밀리초 시간을 기준으로 자막 한 줄이 아닌 의미 단위의 샷을 설계합니다.
- 구현 전에 공통 비주얼 시스템과 간결한 Shot Recipe를 고정합니다.
- 프로젝트 증거에 따라 완전한 샷 구간을 HyperFrames, Remotion 또는 동결 미디어 hybrid 방식으로 배정합니다.
- 사용자가 제공한 미디어를 우선 사용하고, 필요한 샷에만 추가 소재를 확보합니다.
- 전체 프리뷰에서 승인을 기다린 뒤 4K Master를 렌더링하고 기술 검증합니다.

## v0.9 Creative Production

- Director, Assets, 여러 담당 Builder의 창작 분업을 유지합니다. 고정 템플릿으로 축소하지 않으며 구도, 은유, 움직임의 복잡성을 제한하지 않습니다.
- Parent가 backend 계획, 작업 배정, 검사, clip 결합, preview 준비 script를 직접 실행하며 Runtime Planner / Integrator / Render Agent를 실행하지 않습니다. 한 제작 안에서는 소재와 동일한 의존 환경을 공유하고 전체 project를 반복 복사하지 않습니다.
- 각 Builder는 편집 가능한 source와 공통 규격으로 검증된 video clip을 전달합니다. script는 clip을 결합하지만 임의의 HyperFrames / Remotion source를 이해하거나 합칠 수 있다고 주장하지 않습니다.
- 전체 preview는 최대 1080p, `veryfast / CRF 22`로 생성합니다. 승인 identity는 runtime plan, narrative envelope, visual system, 모든 shot contract와 실제 clip hash에 연결됩니다.
- 전달 단계에서는 `--plan`, `--narrative-envelope`, `--visual-system`, 모든 `--contract`를 다시 지정합니다. identity를 재확인한 뒤 동결 clip에서 전체 규격 `medium / CRF 16` Master를 만들며 preview를 복사하지 않습니다.
- 말의 의미와 감정 변화를 animation beat로 바꿉니다. Builder는 주체, 공간, 계층, 관계 또는 시각적 초점이 실제로 발전하도록 만들며 장식용 loop를 주요 animation으로 대신할 수 없습니다.
- 수정은 원래 담당 Builder에게만 돌아가며 모든 Builder에게 전체 제작 기록을 전달하지 않습니다.

검사는 계획된 발전의 누락과 측정 가능한 motion/layout 위험을 찾을 수 있지만 animation의 수준이나 미적 가치를 판단할 수는 없습니다. 최종 판단은 한 번의 전체 동영상 preview로 남습니다. backend 간 시각적 동일성은 보장하지 않습니다.

<p align="center">
  <img src="https://raw.githubusercontent.com/erduo1998-cell/erduo-broll-loop-engineering/main/docs/images/demos/quick-start.gif" alt="SRT에서 승인된 4K Master까지의 사용 흐름" width="100%">
</p>

## 설치

필수 환경: macOS, Node.js 20 이상, FFmpeg/FFprobe, Codex 또는 Claude Code.

```bash
git clone https://github.com/erduo1998-cell/erduo-broll-loop-engineering.git
cd erduo-broll-loop-engineering
./Install.command
```

설치 후 호스트를 다시 시작하세요. 설치 프로그램은 고정된 HyperFrames 환경과 13개의 Stage Skill을 설치합니다. `sudo`를 사용하거나 셸 설정을 수정하거나 Remotion을 전역 설치하지 않습니다.

## 첫 실행

SRT를 첨부하고 다음과 같이 요청하세요.

```text
erduo-broll-loop-engineering을 사용해 이 SRT를 인물이 나오지 않는 B-roll Master로 만들어 주세요.
전체 프리뷰에서 제 승인이 필요할 때까지 자동으로 계속 진행해 주세요.
```

토킹헤드 모드에는 자막과 일치하는 편집 완료 영상도 필요합니다. 이미지, 영상, 로고, 스크린샷이 있다면 처음에 함께 제공하세요.

## 언어 지원

UTF-8 SRT 입력은 중국어로 제한되지 않습니다. 실제 언어 품질은 호스트 모델의 언어 이해 능력과 프로젝트 글꼴의 해당 문자 지원 여부에 따라 달라집니다. 기본 B-roll Master에는 전체 자막을 굽지 않습니다.

## 검증 범위

- macOS의 Codex와 Claude Code에서 검증했습니다.
- 기본 결과물: H.264 MP4, 3840 × 2160, 30 fps.
- 출력 정책은 직접 JSON으로 작성하지 않고 `create-production-profile.mjs`로 생성합니다. Parent는 이 파일을 항상 `plan-runtime.mjs --production-profile`에 전달하며 너비, 높이, fps, 오디오, H.264 MP4 조건을 계획, 각 Builder 작업, 납품 검증에 동일한 해시로 고정합니다. 예를 들어 `--width 1080 --height 1920 --fps 25 --audio silent --master-format h264-mp4`는 기본값으로 되돌아가지 않는 세로형 25 fps 프로필을 만듭니다.
- HyperFrames와 Remotion은 독립 백엔드이며 시각적 동일성을 보장하지 않습니다.
- Windows, 데스크톱 CapCut/Jianying 가져오기, 임의의 기존 프로젝트 자동 복구는 검증되지 않았습니다.
- 전체 기술 계약과 문제 해결 안내는 [중국어 간체 README](README.md)를 참고하세요.

라이선스: [MIT](LICENSE) · 지원 범위: [SUPPORT-MATRIX.md](SUPPORT-MATRIX.md) · 기여: [CONTRIBUTING.md](CONTRIBUTING.md)
