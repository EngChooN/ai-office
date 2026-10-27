---
name: feature-flow-large
description: "큰 기능: 기획 → 디자인 → 설계 2안 → 구현 → 리뷰 → QA"
kind: process
---

web-flitto feature-flow(large)를 단계형으로 옮긴 프로세스 매뉴얼입니다. 원본: .claude/commands/feature-flow.md

각 단계 담당은 랩 멤버의 직무로 정해지고, 리뷰·QA에서 revise가 나오면 구현으로 되돌아갑니다(최대 2회).

```office-process
[
  {
    "id": "pm",
    "title": "기획 정리",
    "role": "기획자",
    "instruction": "Jira·Figma 링크와 설명을 읽고 프론트엔드 구현용 일감 명세를 만드세요. 범위, 화면별 요구사항, 예외 케이스, 확인이 필요한 질문을 정리합니다. 코드는 고치지 마세요.",
    "needsMyCheck": true,
    "onRevise": null,
    "maxLoops": 2
  },
  {
    "id": "design",
    "title": "디자인 매핑",
    "role": "디자이너",
    "instruction": "명세의 화면을 web-flitto 디자인 시스템(@packages/flitto-design-system 컴포넌트, System Color 토큰, font mixin)에 매핑하세요. 새로 만들어야 하는 컴포넌트가 있으면 따로 적습니다. 코드는 고치지 마세요.",
    "needsMyCheck": true,
    "onRevise": null,
    "maxLoops": 2
  },
  {
    "id": "pattern",
    "title": "설계 (패턴)",
    "role": "패턴",
    "instruction": "최신 패턴·분리·유지보수성 관점에서 구현 설계안을 만드세요. 파일 구조, 컴포저블/queries 분리, 상태 흐름을 제안합니다. 코드는 고치지 마세요.",
    "needsMyCheck": false,
    "onRevise": null,
    "maxLoops": 2
  },
  {
    "id": "readable",
    "title": "설계 (가독성)",
    "role": "가독성",
    "instruction": "앞 설계안을 짧은 코드·컴포넌트 재활용·즉시 가독 관점에서 다듬어 최종 설계안 하나로 합치세요. 코드는 고치지 마세요.",
    "needsMyCheck": false,
    "onRevise": null,
    "maxLoops": 2
  },
  {
    "id": "구현",
    "title": "구현",
    "role": "팀장",
    "instruction": "승인된 명세·디자인과 최종 설계안대로 구현하세요. .agents/rules의 코딩 컨벤션을 지키고, 다른 직원에게 맡기지 말고 직접 구현하세요. 끝나면 바꾼 파일과 확인 방법을 정리하세요. 커밋은 하지 마세요.",
    "needsMyCheck": false,
    "onRevise": null,
    "maxLoops": 2
  },
  {
    "id": "리뷰",
    "title": "코드 리뷰",
    "role": "리뷰어",
    "instruction": "방금 구현된 변경(git diff)을 컨벤션과 동작 가능성 관점에서 리뷰하세요. 코드는 직접 고치지 말고 피드백만 냅니다. 고칠 게 있으면 revise입니다.",
    "needsMyCheck": false,
    "onRevise": "구현",
    "maxLoops": 2
  },
  {
    "id": "qa",
    "title": "QA",
    "role": "QA",
    "instruction": "변경을 실제로 구동해 e2e 동작을 확인하세요(가능하면 dev 서버·브라우저). 코드는 고치지 말고 pass/fail 판정과 근거만 냅니다. 실패면 revise입니다.",
    "needsMyCheck": true,
    "onRevise": "구현",
    "maxLoops": 2
  }
]
```
