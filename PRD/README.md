# 할일+습관 트래커 -- 디자인 문서

> Show Me The PRD로 생성됨 (2026-03-20)

---

## 문서 구성

| 문서 | 내용 | 언제 읽나 |
|------|------|----------|
| [01_PRD.md](./01_PRD.md) | 뭘 만드는지, 누가 쓰는지, 성공 기준 | 프로젝트 시작 전 |
| [02_DATA_MODEL.md](./02_DATA_MODEL.md) | Task/SubTask/Habit/HabitLog 구조 | DB 설계할 때 |
| [03_PHASES.md](./03_PHASES.md) | MVP → 확장 → 고도화 단계 계획 | 개발 순서 정할 때 |
| [04_PROJECT_SPEC.md](./04_PROJECT_SPEC.md) | 기술 스택, AI 규칙, SQL | AI에게 코드 시킬 때마다 |

---

## 프로젝트 한 줄 요약

**할 일 + 서브태스크 Progress Bar + 습관 스트릭**을 하나의 웹앱에서.
Next.js 15 + Supabase + Tailwind CSS + shadcn/ui + Vercel 배포.

---

## 다음 단계

Phase 1을 시작하려면 [03_PHASES.md](./03_PHASES.md)의 **"Phase 1 시작 프롬프트"** 를 복사해서 AI에게 붙여넣으세요.

---

## 확정된 결정사항

- [x] Task 완료: 체크박스 전부 체크 시 자동 완료 (체크박스 없으면 수동)
- [x] 체크박스 단축키: `/[]`
- [x] 습관 빈도: daily + 주 N회 모두 지원
- [x] 주 N회 스트릭: 달성한 날 각각 카운트
- [x] HabitLog 취소: 가능
- [x] Task 삭제: 영구 삭제

## 남은 미결 사항

- [ ] 로컬 개발 시 Supabase 에뮬레이터 vs 클라우드 직접 연결
- [ ] shadcn/ui 테마 색상
