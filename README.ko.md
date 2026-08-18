<div align="center">

# Erduo B-roll Loop Engineering

**완전한 original SRT와 design, 선택적인 편집 완료 토킹헤드 영상으로 편집 가능한 source, 직접 렌더링한 shot, 검토용 preview를 만듭니다.**

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
- production 기본값은 HyperFrames이며 Remotion은 명시적 선택/canary만, `auto`는 실험적 opt-in만 허용합니다.
- 사용자가 제공한 미디어를 우선 사용하고, 필요한 샷에만 추가 소재를 확보합니다.
- 대량 제작 전에 Lead의 세 가지 최종 sample과 사용자가 선택하는 5-shot canary를 보여 주고, 각 shot을 직접 렌더링하여 6-frame 이미지와 전체 preview를 만듭니다.

## v1.0.1: Chapter Builder 창작 루프 복원

v1.0.1은 정식 공개 버전입니다. 의미 shot은 계속 독립 H.264 미디어 경계이지만, 보통 5–8개의 연속 shot을 한 Chapter Builder가 맡습니다. 완전한 original SRT/design을 직접 읽고 `truth`는 바꾸지 않으며, `creativeProposal`은 짧은 이유와 함께 수정할 수 있고 chapter 전체의 구도, 소재, 리듬, 연결을 책임집니다.

Assets는 알려진 공유 소재/폰트만 고정하고 shot별 `search`, `generate`, `mixed` 경로를 닫지 않습니다. Lead는 native graphic/type, 실제 또는 생성 소재 fusion, 정보 밀도가 높은 interface/process/data의 세 가지 최종 sample과 signature motion, 소재 융합 능력, 짧은 capability index를 만듭니다. Builder는 실제 6-frame sheet와 chapter preview를 열고 결함을 고친 뒤 `accepted` 또는 `revised`를 반환합니다.

production source에서 `inspection.tsx`, DOM trace marker, 수동 motion window, 성공 상태 dense diagnostics를 제거합니다. Parent는 render/decode/hash/contract/sheet/preview의 기계적 작업만 담당합니다. 12원칙은 짧은 긍정 anchor이며 각 shot은 관련된 2–4개 `craftIntent`만 선택하고 점수나 proof를 만들지 않습니다.

production 기본값은 HyperFrames입니다. Remotion은 명시적 opt-in/canary만, `auto`는 실험적 opt-in만 허용합니다. 5-shot canary가 direct delivery, Builder 실제 시청, 구도/소재/signature motion 다양성, 사용자 선택 3/5 이상, 첫 preview ≤45분을 통과하기 전에는 전체 영상을 시작하지 않습니다.

2026-08-18의 179.866초 Remotion run은 실패 근거로 남깁니다. 20/20 media contract/decode는 통과했지만 20 creative units, original design 미전달, 소재 부족, 기술 inspection 통과에도 시각 품질은 불합격이었습니다. 203m13s / 54m17s / 63m13s도 목표를 넘었으며 이번 수정이나 backend 동등성을 증명하지 않습니다.

## v1.0.0 대량 제작 전 Visual Lock

- Director의 의미 샷은 보통 약 5–12초입니다. Runtime Plan v3는 짧은 샷과 Builder unit을 별도로 계획하며, 일반적인 약 180초 단일 backend 영상은 2–3 Builder를 목표로 하지만 강제 수량은 아닙니다.
- Lead Builder가 opening, 정보 밀집 구간, 후반 대표 장면과 실제 backend별 공유 visual source를 먼저 만듭니다. 사용자가 승인, 수정, 명시적 skip 중 하나를 선택해야 나머지 Builder가 시작됩니다.
- 일반 단일 backend unit의 기본값은 고품질 H.264 MP4(`libx264 / medium / CRF 12`)입니다. FFV1은 Hybrid, 투명도 또는 실제 lossless 교환 필요가 있을 때만 이유를 기록하고 명시적으로 선택합니다.
- motion/layout은 beat 경계, readable hold, cut, 필수 sampling을 먼저 검사합니다. 이상 구간과 정밀 diagram/path만 dense trace로 확대하며 정상 작업은 전체 frame PNG를 만들지 않습니다.
- 공개 안전 production metrics는 단계 시간, Agent 호출, unit, 파일/byte, render/trace/decode/hash, 실패/재시도, 선택적 host token 사실을 기록합니다. token 사실이 없으면 추정하지 않고 unknown으로 둡니다.

[v1.0.0 공개 production benchmark](docs/V1.0.0-BENCHMARK.md)는 동일한 179.866초 SRT를 Codex에서 실제 제작한 결과입니다. Shot Recipe v3 20개, Lead 1명 + production Builder 3명, Agent 호출 10회, full-history 호출 0회, 외부 소재 0개, 파일 213개, disk usage 156,980 KiB였습니다. preview와 Master는 full decode를 통과했습니다. Director 시작부터 첫 preview까지 약 242.05분으로 120분 목표를 넘었고, Lead도 62.90분으로 45분 목표를 넘었습니다. Director의 visual-lock 거절 1회는 지정 수정 후 재검사를 통과했지만 사용자가 시청하거나 미적 승인을 하지 않았으므로 상태는 `skipped`입니다. host token은 unknown이고 음성 동기화는 미검증이며, Claude Code 동일 입력 비교는 pending입니다.

## v0.9.2 제작 성능은 그대로, 설치 경로는 더 명확하게

v0.9.2는 배포 형식과 설치 진입점만 변경합니다. Director, Assets, 다중 Builder, 152개 카드, 8개 다이어그램 grammar, 런타임 라우팅, 프리뷰 승인과 납품 계약은 v0.9.1과 동일합니다.

## v0.9.1 Creative Production과 더 이해하기 쉬운 다이어그램

- Director, Assets, 여러 담당 Builder의 창작 분업을 유지합니다. 고정 템플릿으로 축소하지 않으며 구도, 은유, 움직임의 복잡성을 제한하지 않습니다.
- Parent가 backend 계획, 작업 배정, 검사, clip 결합, preview 준비 script를 직접 실행하며 Runtime Planner / Integrator / Render Agent를 실행하지 않습니다. 한 제작 안에서는 소재와 동일한 의존 환경을 공유하고 전체 project를 반복 복사하지 않습니다.
- 각 Builder는 편집 가능한 source와 공통 규격으로 검증된 video clip을 전달합니다. script는 clip을 결합하지만 임의의 HyperFrames / Remotion source를 이해하거나 합칠 수 있다고 주장하지 않습니다.
- 전체 preview는 최대 1080p, `veryfast / CRF 22`로 생성합니다. 승인 identity는 runtime plan, narrative envelope, visual system, 모든 shot contract와 실제 clip hash에 연결됩니다.
- 전달 단계에서는 `--plan`, `--narrative-envelope`, `--visual-system`, 모든 `--contract`를 다시 지정합니다. identity를 재확인한 뒤 동결 clip에서 전체 규격 `medium / CRF 16` Master를 만들며 preview를 복사하지 않습니다.
- 말의 의미와 감정 변화를 animation beat로 바꿉니다. Builder는 주체, 공간, 계층, 관계 또는 시각적 초점이 실제로 발전하도록 만들며 장식용 loop를 주요 animation으로 대신할 수 없습니다.
- 말의 핵심이 과정, 인과, 시간 순서, 계층, feedback, 의존 관계, system route 또는 같은 기준의 비교일 때만 Director가 8개의 가벼운 diagram grammar 중 하나를 선택할 수 있습니다. 사용 개수 의무, 외부 Skill 전체 로딩, 고정 visual skin은 없습니다.
- Builder는 전체 visual system에 맞춰 공간, 재질, animation을 자유롭게 설계합니다. script는 실제 render geometry를 기준으로 무관한 node를 가로지르는 connector, label과 path/node의 접촉, connector path 중복, canvas 이탈만 검사하며 다이어그램 style은 평가하지 않습니다.
- 수정은 원래 담당 Builder에게만 돌아가며 모든 Builder에게 전체 제작 기록을 전달하지 않습니다.

검사는 계획된 발전의 누락과 측정 가능한 motion/layout 위험을 찾을 수 있지만 animation의 수준이나 미적 가치를 판단할 수는 없습니다. Visual lock은 대량 제작, 전체 preview는 납품을 판단합니다. backend 간 시각적 동일성은 보장하지 않습니다.

<p align="center">
  <img src="https://raw.githubusercontent.com/erduo1998-cell/erduo-broll-loop-engineering/main/docs/images/demos/quick-start.gif" alt="SRT에서 승인된 4K Master까지의 사용 흐름" width="100%">
</p>

## 설치

### 표준 Skill 설치

고정 HyperFrames 환경이 이미 준비된 컴퓨터용입니다. v1.0.1 Release에서 `erduo-broll-loop-engineering-skills-v1.0.1.tar.gz`를 내려받아 압축을 푼 뒤 실행합니다.

```bash
npx -y skills@1.5.22 add ./erduo-broll-loop-engineering-skills-1.0.1 --skill '*' --agent codex --global --full-depth
# Claude Code는 codex를 claude-code로 변경
```

이 경로는 14개 프로젝트 Skill만 등록하며 Node, 브라우저, FFmpeg를 준비하지 않습니다. 필수 환경이 없으면 작업을 중단하고 아래의 전체 환경 설치를 사용합니다.

### 전체 환경 설치

필수 환경: macOS, Node.js 22.20 이상, FFmpeg/FFprobe, Codex 또는 Claude Code.

```bash
git clone https://github.com/erduo1998-cell/erduo-broll-loop-engineering.git
cd erduo-broll-loop-engineering
./Install.command
```

설치 후 호스트를 다시 시작하세요. 설치 프로그램은 고정된 HyperFrames 환경과 13개의 Stage Skill을 설치합니다. `sudo`를 사용하거나 셸 설정을 수정하거나 Remotion을 전역 설치하지 않습니다.

## 첫 실행

완전한 original SRT와 design을 첨부하고 다음과 같이 요청하세요.

```text
erduo-broll-loop-engineering을 사용해 이 original SRT와 design을 편집 가능한 B-roll shot 파일과 전체 preview로 만들어 주세요. 전체 Master는 제가 명시적으로 요청할 때만 만들어 주세요.
5-shot canary까지 자동 실행한 뒤 shot별 선택을 위해 멈추고, 5개 중 3개 이상에서 이 버전을 선택하기 전에는 전체 production을 시작하지 마세요. 최종 preview 납품 승인에서도 다시 멈춰 주세요.
```

토킹헤드 모드에는 자막과 일치하는 편집 완료 영상도 필요합니다. 이미지, 영상, 로고, 스크린샷이 있다면 처음에 함께 제공하세요.

## 언어 지원

UTF-8 SRT 입력은 중국어로 제한되지 않습니다. 실제 언어 품질은 호스트 모델의 언어 이해 능력과 프로젝트 글꼴의 해당 문자 지원 여부에 따라 달라집니다. 기본 B-roll Master에는 전체 자막을 굽지 않습니다.

## 검증 범위

- macOS의 Codex에서 v1.0.0 production benchmark를 완료했습니다. Claude Code 설치/계약은 검증했지만 동일 입력 v1 production 비교는 pending입니다.
- v1.0.1 기본 결과물: runtime source에서 직접 렌더링한 순서형 H.264 shot, 3840 × 2160, 30 fps. 전체 Master는 선택 사항입니다.
- 동일 입력의 새 5-shot HyperFrames canary는 직접 render, full decode, 시청 receipt, 구성·소재·signature motion gate를 통과했습니다. 사용자는 결과를 승인하고 나머지 shot과 전체 preview를 만들지 않고 공개하도록 명시했습니다. 따라서 전체 production이나 두 backend의 동등 지원은 주장하지 않습니다.
- 출력 정책은 직접 JSON으로 작성하지 않고 `create-production-profile.mjs`로 생성합니다. Parent는 이 파일을 항상 `plan-runtime.mjs --production-profile`에 전달하며 너비, 높이, fps, 오디오, H.264 MP4 조건을 계획, 각 Builder 작업, 납품 검증에 동일한 해시로 고정합니다. 예를 들어 `--width 1080 --height 1920 --fps 25 --audio silent --master-format h264-mp4`는 기본값으로 되돌아가지 않는 세로형 25 fps 프로필을 만듭니다.
- HyperFrames와 Remotion은 독립 백엔드이며 시각적 동일성을 보장하지 않습니다.
- Windows, 데스크톱 CapCut/Jianying 가져오기, 임의의 기존 프로젝트 자동 복구는 검증되지 않았습니다.
- 전체 기술 계약과 문제 해결 안내는 [중국어 간체 README](README.md)를 참고하세요.

라이선스: [MIT](LICENSE) · 지원 범위: [SUPPORT-MATRIX.md](SUPPORT-MATRIX.md) · 기여: [CONTRIBUTING.md](CONTRIBUTING.md)
