---
name: feature-flow-small
description: "작은 수정: 팀장 구현 → 리뷰"
kind: process
---

web-flitto feature-flow(small)를 단계형으로 옮긴 프로세스 매뉴얼입니다. 원본: .claude/commands/feature-flow.md

각 단계 담당은 랩 멤버의 직무로 정해지고, 리뷰·QA에서 revise가 나오면 구현으로 되돌아갑니다(최대 2회).

```office-process
[
  {
    "id": "구현",
    "title": "구현",
    "role": "팀장",
    "instruction": "일감대로 수정하세요. .agents/rules의 코딩 컨벤션을 지키고, 다른 직원에게 맡기지 말고 직접 구현하세요. 끝나면 바꾼 파일과 확인 방법을 정리하세요. 커밋은 하지 마세요.",
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
  }
]
```
