'use client'

import { useState } from 'react'
import { Habit, HabitLog } from '@/types'
import { SupabaseClient } from '@supabase/supabase-js'
import { calcStreak, isTodayCompleted } from '@/lib/streak'
import { Plus, X, Flame } from 'lucide-react'

interface Props {
  habits: Habit[]
  setHabits: (habits: Habit[]) => void
  habitLogs: HabitLog[]
  setHabitLogs: (logs: HabitLog[]) => void
  userId: string
  today: string
  supabase: SupabaseClient
}

export default function HabitSection({ habits, setHabits, habitLogs, setHabitLogs, userId, today, supabase }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [frequency, setFrequency] = useState<'daily' | 'weekly'>('daily')
  const [targetCount, setTargetCount] = useState(3)

  async function handleAddHabit(e: React.FormEvent) {
    e.preventDefault()
    const title = newTitle.trim()
    if (!title) return

    const { data, error } = await supabase
      .from('habits')
      .insert({
        title,
        user_id: userId,
        frequency,
        target_count: frequency === 'weekly' ? targetCount : null,
        start_date: today,
      })
      .select()
      .single()

    if (!error && data) {
      setHabits([...habits, data])
      setNewTitle('')
      setShowForm(false)
    }
  }

  async function handleToggleLog(habit: Habit) {
    const alreadyDone = isTodayCompleted(habit.id, habitLogs, today)
    const existingLog = habitLogs.find(l => l.habit_id === habit.id && l.date === today)

    if (alreadyDone && existingLog) {
      setHabitLogs(habitLogs.map(l =>
        l.id === existingLog.id ? { ...l, is_completed: false } : l
      ))
      await supabase.from('habit_logs').update({ is_completed: false }).eq('id', existingLog.id)
    } else if (existingLog) {
      setHabitLogs(habitLogs.map(l =>
        l.id === existingLog.id ? { ...l, is_completed: true } : l
      ))
      await supabase.from('habit_logs').update({ is_completed: true }).eq('id', existingLog.id)
    } else {
      const { data, error } = await supabase
        .from('habit_logs')
        .insert({ habit_id: habit.id, date: today, is_completed: true })
        .select()
        .single()
      if (!error && data) setHabitLogs([...habitLogs, data])
    }
  }

  async function handleArchive(habitId: string) {
    setHabits(habits.filter(h => h.id !== habitId))
    await supabase.from('habits').update({ is_archived: true }).eq('id', habitId)
  }

  return (
    <section>
      {/* 새 습관 추가 행 */}
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="w-full flex items-center gap-3 px-5 py-3 border-b border-[#e3e2e0] text-sm text-[#9b9a97] hover:text-[#37352f] hover:bg-[#f7f6f3] transition-colors"
        >
          <Plus size={14} className="flex-shrink-0" />
          새 습관 추가...
        </button>
      ) : (
        <form onSubmit={handleAddHabit} className="border-b border-[#e3e2e0] px-5 py-4 space-y-3 bg-[#f7f6f3]">
          <input
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            placeholder="습관 이름"
            className="w-full text-sm text-[#37352f] placeholder:text-[#9b9a97] bg-white border border-[#e3e2e0] px-3 py-2 focus:outline-none focus:border-[#37352f]"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setFrequency('daily')}
              className={`flex-1 text-xs py-1.5 border transition-colors ${
                frequency === 'daily'
                  ? 'border-[#37352f] bg-[#37352f] text-white'
                  : 'border-[#e3e2e0] text-[#9b9a97] hover:border-[#9b9a97]'
              }`}
            >
              매일
            </button>
            <button
              type="button"
              onClick={() => setFrequency('weekly')}
              className={`flex-1 text-xs py-1.5 border transition-colors ${
                frequency === 'weekly'
                  ? 'border-[#37352f] bg-[#37352f] text-white'
                  : 'border-[#e3e2e0] text-[#9b9a97] hover:border-[#9b9a97]'
              }`}
            >
              주 N회
            </button>
          </div>
          {frequency === 'weekly' && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#9b9a97]">주</span>
              <input
                type="number"
                min={1}
                max={7}
                value={targetCount}
                onChange={e => setTargetCount(Number(e.target.value))}
                className="w-16 text-sm text-center text-[#37352f] bg-white border border-[#e3e2e0] px-2 py-1 focus:outline-none focus:border-[#37352f]"
              />
              <span className="text-xs text-[#9b9a97]">회</span>
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 text-sm py-1.5 bg-[#37352f] text-white hover:bg-[#2f2d29] transition-colors"
            >
              추가
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-3 text-[#9b9a97] hover:text-[#37352f]"
            >
              <X size={15} />
            </button>
          </div>
        </form>
      )}

      {/* 습관 목록 */}
      <div>
        {habits.map(habit => {
          const done = isTodayCompleted(habit.id, habitLogs, today)
          const streak = calcStreak(habit.id, habitLogs, today)

          return (
            <div
              key={habit.id}
              className="group flex items-center gap-3 px-5 py-3 border-b border-[#e3e2e0] hover:bg-[#f7f6f3] transition-colors"
            >
              {/* 완료 체크 — 원형 (습관은 구별을 위해 원형 유지) */}
              <button
                onClick={() => handleToggleLog(habit)}
                className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                  done
                    ? 'border-orange-400 bg-orange-400'
                    : 'border-[#c1c0bd] hover:border-orange-300'
                }`}
              >
                {done && (
                  <svg width="9" height="7" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>

              {/* 이름 + 빈도 */}
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${done ? 'text-[#9b9a97] line-through' : 'text-[#37352f]'}`}>
                  {habit.title}
                </p>
                <p className="text-xs text-[#9b9a97] mt-0.5">
                  {habit.frequency === 'daily' ? '매일' : `주 ${habit.target_count}회`}
                </p>
              </div>

              {/* 스트릭 */}
              {streak > 0 && (
                <div className="flex items-center gap-1 text-orange-500 flex-shrink-0">
                  <Flame size={13} />
                  <span className="text-sm font-semibold">{streak}</span>
                </div>
              )}

              {/* 보관(삭제) */}
              <button
                onClick={() => handleArchive(habit.id)}
                className="opacity-0 group-hover:opacity-100 text-[#c1c0bd] hover:text-red-400 transition-all"
              >
                <X size={13} />
              </button>
            </div>
          )
        })}

        {habits.length === 0 && !showForm && (
          <p className="px-5 py-8 text-sm text-[#9b9a97] text-center">위에서 습관을 추가해보세요</p>
        )}
      </div>
    </section>
  )
}
