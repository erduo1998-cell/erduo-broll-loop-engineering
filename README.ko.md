<div align="center">

# Erduo B-roll Loop Engineering

**완전한 original SRT와 design을 독립 Director, fresh chapter Creator, Parent 렌더링, 독립 시각 리뷰, 원 Creator의 부분 수정으로 연결해 편집 가능한 B-roll을 만듭니다.**

[简体中文](README.md) · [English](README.en.md) · [日本語](README.ja.md) · **한국어** · [繁體中文](README.zh-TW.md)

[실제 결과](#실제-출력-예시) · [설치](#설치) · [첫 실행](#첫-실행) · [검증 범위](#검증-범위)

</div>

## 내 토크 영상에 모션을 넣고 싶다면 Agent Motion부터 시작하세요

**소개 영상을 보고 찾아오셨고 자신의 토크 영상에 모션을 넣고 싶다면, [Agent Motion](https://github.com/erduo1998-cell/agent-motion#start)을 권장합니다(영문 안내).**

이 프로젝트는 여러 역할과 단계로 구성된 B-roll 제작 흐름으로, 설치와 이해, 유지 관리에 더 많은 노력이 필요합니다. 일상적인 토크 영상 제작에는 Agent Motion이 더 적합합니다. 원본 영상, 전체 SRT, 제작 요구 사항을 코딩 에이전트에 전달해 MP4와 편집 가능한 프로젝트를 제작합니다.

**[Agent Motion 결과물과 설치 방법 보기 →](https://github.com/erduo1998-cell/agent-motion#start)**

ZIP을 내려받아 설치 프로그램을 실행할 수 있지만, Node.js 22+와 코딩 에이전트가 필요하며 최초 설치에는 인터넷 연결이 필요합니다. 별도 프로젝트이므로 기존 프로젝트를 그대로 업그레이드하는 방식은 아닙니다. 이 저장소의 소스, 문서, 이전 릴리스는 기존 사용자와 기술 참고를 위해 유지합니다.

라이선스는 다릅니다. 이 프로젝트는 MIT이며, Agent Motion은 비상업적 사용을 위한 라이선스로 상업적 사용에는 사전 서면 허가가 필요합니다. [라이선스](https://github.com/erduo1998-cell/agent-motion/blob/main/LICENSE)를 확인하세요.

## 실제 출력 예시

<p align="center">
  <img src="docs/images/demos/homepage-showcase.gif" alt="SRT 입력, 의미별 연출, 소재 결합, 렌더링과 전달을 보여 주는 실제 B-roll" width="100%">
</p>

README의 가벼운 GIF는 40초, 3840 × 2160, 30 fps 전체 Master를 보여 줍니다. 실제 시각 능력의 한 예이며, 모든 입력이 같은 화면을 얻거나 HyperFrames와 Remotion의 시각 결과가 같다는 보장은 아닙니다.

## 주요 기능

- 완전한 original SRT/design을 한 project에 보존하고 의미, 시간, 연속성에 따라 shot을 설계합니다.
- 독립 Director가 visual world와 seam을 정하고, fresh Creator는 원본, 짧은 공통 방향, 담당 shot card와 인접 seam만 받아 연속 구간을 제작합니다.
- Parent가 plan check, shot별 render/decode, sheet, preview 조립을 맡고 부분 수정 뒤 바뀌지 않은 로컬 결과를 재사용합니다.
- 별도의 시각 Reviewer가 실제 화면과 움직이는 연결을 판단하고, 구체적인 문제는 원 Creator에게 돌려보냅니다.
- v1.1.0 기본 흐름에는 세 종류 sample, 5-shot canary, chapter별 고정 shot 수, 소재·장식 수 할당이 없습니다.

## v1.1.0: 화면 품질 우선 창작 릴레이

새 작업의 기본 흐름은 **독립 Director → fresh 연속 chapter Creator → Parent script → 독립 시각 Reviewer → 원 Creator 부분 수정**입니다. 창작 역할에는 완전한 원본과 필요한 맥락을 제공하되, Parent의 전체 대화, 무관한 Skill, Creator 설명과 cost를 모든 판단에 전달하지 않습니다.

Parent는 [제작 명령](erduo-broll-loop-engineering/references/lean-production.md)으로 render, 검증, 조립, 바뀌지 않은 결과의 로컬 재사용을 맡습니다. Creator가 결과를 본 뒤 독립 Reviewer가 실제 media를 판단합니다. contact sheet는 연속 재생을 대신하지 않으며 기술 성공만으로 미적 승인을 할 수 없습니다. style이 불확실하거나 공유 transition이 복잡할 때만 대표 구간을 먼저 만들 수 있습니다.

부분 rerender와 재사용은 검증했지만 전체 시간이나 Token 감소는 **아직 입증되지 않았습니다**. task 준비 도구는 host가 넣는 모든 instruction을 제거하거나 sandbox를 강제하지 않습니다. Recipe/runtime-plan v1–v4, 명시적 Remotion/hybrid, 명시적 5-shot 버전 비교는 [호환 production](erduo-broll-loop-engineering/references/legacy-production.md)을 계속 사용합니다.

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
  <img src="docs/images/demos/quick-start.gif" alt="SRT에서 승인된 4K Master까지의 사용 흐름" width="100%">
</p>

## 설치

> 아래는 이 프로젝트의 설치 방법입니다. 자신의 토크 영상에 모션을 넣으려면 [Agent Motion 시작 안내](https://github.com/erduo1998-cell/agent-motion#start)를 먼저 따라 주세요.

### 표준 Skill 설치

고정 HyperFrames 환경이 이미 준비된 컴퓨터용입니다. [v1.1.0 Release](https://github.com/erduo1998-cell/erduo-broll-loop-engineering/releases/tag/v1.1.0)에서 `erduo-broll-loop-engineering-skills-v1.1.0.tar.gz`를 내려받아 장기 보관할 위치에 압축을 푼 뒤 실행합니다.

```bash
npx -y skills@1.5.22 add ./erduo-broll-loop-engineering-skills-1.1.0 --skill '*' --agent codex --global --full-depth
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

설치 후 호스트를 다시 시작하세요. 설치 프로그램은 고정된 HyperFrames 환경과 project Skill을 설치합니다. `sudo`를 사용하거나 셸 설정을 수정하거나 Remotion을 전역 설치하지 않습니다. 전체 archive는 v1.1.0 Release의 `erduo-broll-loop-engineering-v1.1.0.tar.gz`이며 압축을 푼 뒤에도 `./Install.command`를 사용합니다.

진단은 `node scripts/doctor.mjs`, Skill link 제거는 `node scripts/uninstall.mjs`를 사용합니다. uninstall은 기본적으로 user data를 보존합니다. maintainer는 `npm run task:creative -- --project /path/to/project --role director`로 focused task를 준비할 수 있습니다.

## 첫 실행

완전한 original SRT와 design을 첨부하고 다음과 같이 요청하세요.

```text
erduo-broll-loop-engineering을 사용해 이 original SRT와 design을 편집 가능한 B-roll shot 파일과 전체 preview로 만들어 주세요. 전체 Master는 제가 명시적으로 요청할 때만 만들어 주세요.
완전한 원본을 보존하고 독립 Director, fresh 연속 chapter Creator, Parent render, 독립 시각 review를 사용해 주세요. 보이는 문제는 원 Creator가 부분 수정하고, 순서형 shot, 편집 가능한 source/assets, 전체 preview를 전달해 주세요.
```

토킹헤드 모드에는 자막과 일치하는 편집 완료 영상도 필요합니다. 이미지, 영상, 로고, 스크린샷이 있다면 처음에 함께 제공하세요.

## 언어 지원

UTF-8 SRT 입력은 중국어로 제한되지 않습니다. 실제 언어 품질은 호스트 모델의 언어 이해 능력과 프로젝트 글꼴의 해당 문자 지원 여부에 따라 달라집니다. 기본 B-roll Master에는 전체 자막을 굽지 않습니다.

## 검증 범위

- macOS Codex에서 v1.1.0 독립 direction, creation, review, 실제 decode, preview 조립, 부분 rerender 재사용을 확인했습니다. Claude Code 설치/계약은 검증했지만 현재 흐름의 동일 입력 비교는 pending입니다.
- v1.1.0 새 작업은 고정 HyperFrames를 사용하고 순서형 shot, 편집 가능한 HTML/assets, 전체 preview, 실제 출력 정보와 한계를 전달합니다. draft와 final은 구분됩니다.
- 이전 v1.0.1의 동일 입력 5-shot HyperFrames canary는 직접 render, full decode, 시청 receipt, 구성·소재·signature motion gate를 통과했습니다. 사용자는 결과를 승인하고 나머지 shot과 전체 preview를 만들지 않고 공개하도록 명시했습니다. 따라서 전체 production이나 두 backend의 동등 지원은 주장하지 않습니다.
- v1.0.0의 역사적 benchmark는 179.866초 입력으로 첫 preview까지 약 242.05분이 걸렸습니다. v1.0.1 canary 뒤 남은 장편은 취소되었습니다. 이는 v1.1.0의 전체 시간이나 Token 감소 근거가 아닙니다.
- 기존 Remotion/hybrid project는 v1.0.1 호환 route를 사용합니다. HyperFrames와 Remotion은 독립 backend이며 시각적 동일성을 보장하지 않습니다.
- Windows, 데스크톱 CapCut/Jianying 가져오기, 임의의 기존 프로젝트 자동 복구는 검증되지 않았습니다.
- 전체 기술 계약과 문제 해결 안내는 [중국어 간체 README](README.md)를 참고하세요.

## 워크플로

<p align="center">
  <img src="docs/images/workflow-zh.svg" alt="완전한 SRT에서 독립 Director, Creator, Parent render, 시각 review, 부분 수정과 전달까지의 흐름" width="100%">
</p>

## 저자 연락처

<table>
  <tr>
    <td width="260" align="center">
      <img src="docs/images/wechat-contact.jpg" alt="Erduo WeChat QR 코드" width="220">
    </td>
    <td>
      <strong>刘冉 / 耳朵</strong><br><br>
      AI 컨설턴트 · 전 영상 감독 · 오픈소스 Agent 도구 실천가<br><br>
      GitHub: <a href="https://github.com/erduo1998-cell">@erduo1998-cell</a><br>
      웹사이트: <a href="https://erduo.art">erduo.art</a><br>
      WeChat: 왼쪽 QR 코드를 스캔하세요
    </td>
  </tr>
</table>

라이선스: [MIT](LICENSE) · 지원 범위: [SUPPORT-MATRIX.md](SUPPORT-MATRIX.md) · 기여: [CONTRIBUTING.md](CONTRIBUTING.md)
