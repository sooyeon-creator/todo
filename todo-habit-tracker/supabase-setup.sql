-- ① tasks 테이블
create table if not exists tasks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  title      text not null,
  description jsonb,
  is_done    boolean not null default false,
  done_at    timestamptz,
  due_date   date,
  created_at timestamptz not null default now()
);

-- ② habits 테이블
create table if not exists habits (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  frequency   text not null default 'daily' check (frequency in ('daily', 'weekly')),
  target_days integer[],
  target_count integer,
  start_date  date not null default current_date,
  is_archived boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ③ habit_logs 테이블
create table if not exists habit_logs (
  id           uuid primary key default gen_random_uuid(),
  habit_id     uuid not null references habits(id) on delete cascade,
  date         date not null,
  is_completed boolean not null default true,
  unique (habit_id, date)
);

-- 카드 아이콘 컬럼 추가
alter table tasks add column if not exists icon text;

-- 기약없음 / 기억용 컬럼 추가 (기존 DB에 없으면 추가)
alter table tasks add column if not exists is_no_deadline boolean not null default false;
alter table tasks add column if not exists is_memory      boolean not null default false;

-- ④ Row Level Security (본인 데이터만 접근)
alter table tasks      enable row level security;
alter table habits     enable row level security;
alter table habit_logs enable row level security;

create policy "tasks: own data"      on tasks      for all using (auth.uid() = user_id);
create policy "habits: own data"     on habits     for all using (auth.uid() = user_id);
create policy "habit_logs: own data" on habit_logs for all
  using (habit_id in (select id from habits where user_id = auth.uid()));
