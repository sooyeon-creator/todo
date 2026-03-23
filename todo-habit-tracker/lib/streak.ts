import { HabitLog } from '@/types'

// 특정 habit의 스트릭 계산 (달성한 날 각각 카운트)
export function calcStreak(habitId: string, logs: HabitLog[], today: string): number {
  const completedDates = new Set(
    logs
      .filter(l => l.habit_id === habitId && l.is_completed)
      .map(l => l.date)
  )

  let streak = 0
  let current = new Date(today)

  // 오늘부터 역순으로 연속된 달성일 카운트
  while (true) {
    const dateStr = current.toISOString().split('T')[0]
    if (!completedDates.has(dateStr)) break
    streak++
    current.setDate(current.getDate() - 1)
  }

  return streak
}

// 오늘 해당 habit이 완료됐는지
export function isTodayCompleted(habitId: string, logs: HabitLog[], today: string): boolean {
  return logs.some(l => l.habit_id === habitId && l.date === today && l.is_completed)
}
