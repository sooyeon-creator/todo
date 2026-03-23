export interface Task {
  id: string
  user_id: string
  title: string
  description: object | null  // Tiptap JSON
  is_done: boolean
  done_at: string | null
  due_date: string | null
  note: string | null
  category: 'work' | 'personal' | null
  sort_order: number | null
  created_at: string
  tag: string | null
  icon: string | null       // 카드 큰 체크 버튼에 표시할 이모지
  is_no_deadline?: boolean  // 기약 없음 — 완료해도 할 일 섹션에 잔류 (DB 마이그레이션 전 undefined 허용)
  is_memory?: boolean       // 기억용 — 별도 '기억' 섹션에 고정 (DB 마이그레이션 전 undefined 허용)
}

export interface Habit {
  id: string
  user_id: string
  title: string
  frequency: 'daily' | 'weekly'
  target_days: number[] | null   // 0=일,1=월,...6=토
  target_count: number | null    // 주 N회일 때
  start_date: string
  is_archived: boolean
  created_at: string
}

export interface HabitLog {
  id: string
  habit_id: string
  date: string
  is_completed: boolean
}

// Tiptap TaskItem 노드에서 추출한 체크박스 집계
export interface CheckboxStats {
  total: number
  checked: number
}
