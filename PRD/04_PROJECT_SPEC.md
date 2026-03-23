# 할일+습관 트래커 -- 프로젝트 스펙

> AI가 코드를 짤 때 지켜야 할 규칙과 절대 하면 안 되는 것.
> 이 문서를 AI에게 항상 함께 공유하세요.

---

## 기술 스택

| 영역 | 선택 | 이유 |
|------|------|------|
| 프레임워크 | Next.js 15 (App Router) | AI 코딩 호환 최상, 커뮤니티 풀부함 |
| UI 라이브러리 | Tailwind CSS + shadcn/ui | 빠른 UI 구성, 컴포넌트 재사용 |
| 데이터베이스 | Supabase (PostgreSQL) | 무료 티어 월 50만 요청, RLS 보안 내장 |
| 인증 | Supabase Auth (Google OAuth) | 클릭 한 번 로그인, 비밀번호 불필요 |
| 배포 | Vercel (free tier) | Next.js 최적 배포, 자동 CI/CD |
| 언어 | TypeScript | 타입 안전성, AI 코딩 시 오류 감소 |

---

## 프로젝트 구조

```
todo-habit-tracker/
├── src/
│   ├── app/
│   │   ├── page.tsx           # 메인 대시보드
│   │   ├── layout.tsx         # 루트 레이아웃
│   │   ├── login/
│   │   │   └── page.tsx       # 로그인 페이지
│   │   └── api/               # API Routes (필요 시)
│   ├── components/
│   │   ├── tasks/
│   │   │   ├── TaskList.tsx
│   │   │   ├── TaskItem.tsx
│   │   │   ├── TaskInput.tsx
│   │   │   └── TaskDetailCanvas.tsx
│   │   ├── subtasks/
│   │   │   ├── SubTaskList.tsx
│   │   │   └── ProgressBar.tsx
│   │   └── habits/
│   │       ├── HabitList.tsx
│   │       ├── HabitItem.tsx
│   │       └── StreakBadge.tsx
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts      # 클라이언트 Supabase 인스턴스
│   │   │   └── server.ts      # 서버 Supabase 인스턴스
│   │   └── utils.ts
│   └── types/
│       └── index.ts           # Task, SubTask, Habit, HabitLog 타입
├── public/
├── .env.local                 # 환경변수 (절대 Git에 올리지 말 것)
├── .env.example               # 환경변수 예시 (Git에 올려도 됨)
└── package.json
```

---

## 절대 하지 마 (DO NOT)

> AI에게 코드를 시킬 때 이 목록을 반드시 함께 공유하세요.

- [ ] API 키나 Supabase URL을 코드에 직접 쓰지 마 (반드시 `.env.local` 사용)
- [ ] 기존 Supabase DB 스키마를 마이그레이션 파일 없이 임의로 변경하지 마
- [ ] 목업/하드코딩 데이터로 "완성"이라고 하지 마 (항상 실제 DB 연결)
- [ ] `any` 타입을 TypeScript에서 사용하지 마
- [ ] Phase 2 기능(마감일 UI, 알림, 차트)을 Phase 1에서 미리 구현하지 마
- [ ] `package.json`의 기존 의존성 버전을 임의로 변경하지 마
- [ ] Supabase RLS를 비활성화하거나 `FOR ALL USING (true)`로 설정하지 마
- [ ] `user_id` 없이 데이터를 삽입하지 마 (모든 데이터는 소유자 필수)

---

## 항상 해 (ALWAYS DO)

- [ ] 변경하기 전에 어떤 파일을 수정할지 계획을 먼저 보여줘
- [ ] 환경변수는 `.env.local`에 저장, `.env.example`에 키 이름만 공개
- [ ] 에러 발생 시 사용자에게 친절한 한국어 메시지 표시
- [ ] 웹 브라우저(PC) 화면에 최적화 (최소 너비 768px 이상 기준)
- [ ] Supabase 쿼리는 항상 `user_id = auth.uid()` 조건 포함
- [ ] 새 컴포넌트 만들 때 `src/types/index.ts`에 타입 먼저 정의
- [ ] SubTask Progress Bar는 SubTask가 없으면 표시하지 않음

---

## 테스트 방법

```bash
# 로컬 개발 서버 실행
npm run dev

# TypeScript 타입 체크
npx tsc --noEmit

# 프로덕션 빌드 확인
npm run build

# Supabase 로컬 에뮬레이터 (선택)
npx supabase start
```

---

## 배포 방법

```bash
# 1. Vercel CLI 설치
npm i -g vercel

# 2. 프로젝트 연결
vercel link

# 3. 환경변수 설정 (Vercel 대시보드에서)
# NEXT_PUBLIC_SUPABASE_URL
# NEXT_PUBLIC_SUPABASE_ANON_KEY

# 4. 배포
vercel --prod
```

또는 GitHub 레포에 푸시하면 Vercel이 자동 배포합니다.

---

## 환경변수

| 변수명 | 설명 | 어디서 발급 |
|--------|------|------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | Supabase 대시보드 → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 공개 키 | Supabase 대시보드 → Settings → API |

> `.env.local` 파일에 저장. 절대 GitHub에 올리지 마세요.
> `.gitignore`에 `.env.local`이 포함되어 있는지 반드시 확인하세요.

---

## Supabase 테이블 생성 SQL

> SubTask 별도 테이블 없음. Task의 description(JSONB)에 에디터 내용 전체 저장.

```sql
-- tasks
CREATE TABLE tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description JSONB,                        -- Tiptap 에디터 JSON (텍스트+체크박스)
  is_done BOOLEAN DEFAULT false NOT NULL,   -- 수동 완료 체크
  done_at TIMESTAMPTZ,
  due_date DATE,                            -- Phase 2에서 UI 활성화
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- habits
CREATE TABLE habits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  frequency TEXT CHECK (frequency IN ('daily', 'weekly')) NOT NULL,
  target_days INTEGER[],     -- 주간 반복 시 요일 배열 (0=일,1=월,...6=토)
  target_count INTEGER,      -- 주 N회일 때 목표 횟수
  start_date DATE NOT NULL,
  is_archived BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- habit_logs
CREATE TABLE habit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  habit_id UUID REFERENCES habits(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  is_completed BOOLEAN DEFAULT false NOT NULL,  -- 취소 시 false로 업데이트
  UNIQUE(habit_id, date)                        -- 같은 날 중복 방지
);

-- RLS 활성화
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE habit_logs ENABLE ROW LEVEL SECURITY;

-- RLS 정책 (내 데이터만 접근 가능)
CREATE POLICY "users own tasks" ON tasks FOR ALL USING (user_id = auth.uid());
CREATE POLICY "users own habits" ON habits FOR ALL USING (user_id = auth.uid());
CREATE POLICY "users own habit_logs" ON habit_logs FOR ALL
  USING (habit_id IN (SELECT id FROM habits WHERE user_id = auth.uid()));
```

---

## [NEEDS CLARIFICATION]

- [ ] 로컬 개발 시 Supabase 로컬 에뮬레이터 쓸 것인가? 아니면 클라우드 프로젝트 직접 연결?
- [ ] shadcn/ui 테마 색상: 기본 zinc? 아니면 커스텀 색?
