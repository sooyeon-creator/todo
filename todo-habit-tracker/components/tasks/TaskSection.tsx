'use client'

import { useState, useMemo, Fragment, Dispatch, SetStateAction, useCallback, useRef, useLayoutEffect } from 'react'
import { Task } from '@/types'
import { SupabaseClient } from '@supabase/supabase-js'
import TaskItem from './TaskItem'
import TaskCanvas from './TaskCanvas'
import { getCheckboxStats } from '@/lib/checkboxStats'
import { toggleSubtaskChecked, renameSubtaskItem, addSubtaskAfter, deleteSubtaskItem, getSubtaskItems, setSubtaskCheckedAt } from '@/lib/taskItems'
import { Plus } from 'lucide-react'
import { useSmoothCorners } from '@/hooks/useSmoothCorners'

type SortKey = 'created_at' | 'title' | 'done_at'

type ViewMode = 'card' | 'table'

interface Props {
  tasks: Task[]
  setTasks: (tasks: Task[]) => void
  userId: string
  supabase: SupabaseClient
  categoryFilter?: 'work' | 'personal'
  fixedOffset?: number
  sortKey?: SortKey | null
  sortDir?: 'asc' | 'desc'
  viewMode?: ViewMode
  // 공유 선택 상태 (Dashboard에서 전달)
  sharedSelectedIds?: Set<string>
  sharedSetSelectedIds?: Dispatch<SetStateAction<Set<string>>>
  sharedLastSelectedId?: string | null
  sharedSetLastSelectedId?: Dispatch<SetStateAction<string | null>>
}

// ─── 수~화 주간 헬퍼 ─────────────────────────────
const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토']

function getThisWed(): Date {
  const today = new Date()
  const daysToWed = (today.getDay() - 3 + 7) % 7
  const wed = new Date(today)
  wed.setDate(today.getDate() - daysToWed)
  wed.setHours(0, 0, 0, 0)
  return wed
}

function getWeekOffset(isoDate: string | null | undefined): number {
  if (!isoDate) return 0
  const d = new Date(isoDate)
  const thisWed = getThisWed()
  if (d >= thisWed) return 0
  return Math.ceil((thisWed.getTime() - d.getTime()) / (7 * 24 * 60 * 60 * 1000))
}

function getWeekStartDate(offset: number): Date {
  const wed = getThisWed()
  const d = new Date(wed)
  d.setDate(wed.getDate() - offset * 7)
  return d
}

function formatWeekRange(offset: number): string {
  const start = getWeekStartDate(offset)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  const sm = start.getMonth() + 1
  const sd = start.getDate()
  const em = end.getMonth() + 1
  const ed = end.getDate()
  return `${sm}.${sd}(${DAYS_KO[start.getDay()]})~${em}.${ed}(${DAYS_KO[end.getDay()]})`
}

// 개인 섹션용 월~일 주간 범위
function formatPersonalWeekRange(): string {
  const today = new Date()
  const dayOfWeek = today.getDay() // 0=일, 1=월, ..., 6=토
  const daysFromMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const mon = new Date(today)
  mon.setDate(today.getDate() - daysFromMon)
  mon.setHours(0, 0, 0, 0)
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  const fmt = (d: Date) => `${d.getMonth() + 1}.${d.getDate()}(${DAYS_KO[d.getDay()]})`
  return `${fmt(mon)}~${fmt(sun)}`
}

function formatOldWeekTitle(offset: number): string {
  const start = getWeekStartDate(offset)
  const sm = start.getMonth() + 1
  const sd = start.getDate()
  const weekNum = Math.ceil(sd / 7)
  return `${sm}월 ${weekNum}째주`
}

// 보여줄 항목의 모든 조상(ancestor)을 Set에 추가
function addAncestors(allItems: ReturnType<typeof getSubtaskItems>, visibleSet: Set<number>): Set<number> {
  const result = new Set(visibleSet)
  for (const startIdx of visibleSet) {
    let curIdx = startIdx
    let curDepth = allItems[curIdx].depth
    while (curDepth > 0) {
      let found = false
      for (let i = curIdx - 1; i >= 0; i--) {
        if (allItems[i].depth < curDepth) {
          result.add(i)
          curIdx = i
          curDepth = allItems[i].depth
          found = true
          break
        }
      }
      if (!found) break
    }
  }
  return result
}

// 각 섹션(offset)에 태스크와 보여줄 origIdx Set을 매핑
// visibleOrigIndices === undefined → 서브태스크 없음 (전체 카드만 표시)
type SectionEntry = { task: Task; visibleOrigIndices: Set<number> | undefined }

function buildSectionMap(tasks: Task[]): Map<number, SectionEntry[]> {
  const result = new Map<number, SectionEntry[]>()

  function push(offset: number, entry: SectionEntry) {
    if (!result.has(offset)) result.set(offset, [])
    result.get(offset)!.push(entry)
  }

  for (const task of tasks) {
    const allItems = getSubtaskItems(task.description)

    const createdOffset = getWeekOffset(task.created_at)

    if (allItems.length === 0) {
      // 서브태스크 없음 → 완료+done_at 있으면 done_at 기준, 나머지는 created_at 기준
      push((task.is_done && task.done_at) ? getWeekOffset(task.done_at) : createdOffset, { task, visibleOrigIndices: undefined })
      continue
    }

    // ⌘+완료 (is_done=true, done_at=null): 개별 checkedAt 무시하고 생성날짜 섹션 하나에만 등록
    if (task.is_done && !task.done_at) {
      push(createdOffset, { task, visibleOrigIndices: undefined })
      continue
    }

    // 서브태스크 있음 → 각 항목의 주간 offset으로 분류
    const offsetMap = new Map<number, Set<number>>()
    allItems.forEach((item, origIdx) => {
      let offset: number
      if (!item.checked) {
        offset = createdOffset
      } else if (item.checkedAt) {
        offset = getWeekOffset(item.checkedAt)
      } else {
        offset = task.done_at ? getWeekOffset(task.done_at) : createdOffset
      }
      if (!offsetMap.has(offset)) offsetMap.set(offset, new Set())
      offsetMap.get(offset)!.add(origIdx)
    })

    // 각 offset에 대해 조상 추가 후 등록
    for (const [offset, indices] of offsetMap) {
      push(offset, { task, visibleOrigIndices: addAncestors(allItems, indices) })
    }
  }

  return result
}

// 카드 높이를 컨텐츠 기반으로 추정 (정렬용, px 단위 근사값)
function estimateCardHeight(task: Task, visibleOrigIndices?: Set<number>): number {
  const allItems = getSubtaskItems(task.description)
  const pool = (visibleOrigIndices
    ? allItems.filter((_, i) => visibleOrigIndices.has(i))
    : allItems
  ).filter(i => !i.checked)

  const BASE = 80                          // 패딩 + 제목 + 하단 행
  const NOTE = task.note ? 18 : 0
  const GAUGE = pool.length > 0 ? 36 : 0  // 게이지 pill
  const ROWS = Math.min(pool.length, 10) * 30

  return BASE + NOTE + GAUGE + ROWS
}

function parseTaskIds(raw: string): string[] | null {
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') return parsed
  } catch {}
  return null
}

function GhostCard() {
  return (
    <div style={{
      borderRadius: 12,
      border: '2px dashed rgba(59,130,246,0.45)',
      background: 'rgba(59,130,246,0.04)',
      minHeight: 90,
      pointerEvents: 'none',
    }} />
  )
}

// ─── 마소니 그리드 ──────────────────────────────────────────────
// CSS columns 대신 JS로 열 분배 → Safari 클릭 이벤트 버그 없음
function MasonryGrid({ items, colWidth = 240, gap = 12, padding = 16 }: {
  items: React.ReactNode[]
  colWidth?: number
  gap?: number
  padding?: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [numCols, setNumCols] = useState(1)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      const available = el.offsetWidth - padding * 2
      setNumCols(Math.max(1, Math.floor((available + gap) / (colWidth + gap))))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [colWidth, gap, padding])

  // 라운드로빈으로 열에 분배
  const cols: React.ReactNode[][] = Array.from({ length: numCols }, () => [])
  items.forEach((item, i) => cols[i % numCols].push(item))

  return (
    <div ref={containerRef} style={{ display: 'flex', gap, padding, alignItems: 'flex-start' }}>
      {cols.map((col, ci) => (
        <div key={ci} style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', gap }}>
          {col}
        </div>
      ))}
    </div>
  )
}

// ─── 테이블 뷰 ────────────────────────────────────────────────
const TABLE_COLS = [
  { key: 'status',      label: '',         width: 36  },
  { key: 'title',       label: '제목',      width: 'auto' as const },
  { key: 'tag',         label: '태그',      width: 80  },
  { key: 'flags',       label: '속성',      width: 100 },
  { key: 'created_at',  label: '생성일',    width: 80  },
  { key: 'done_at',     label: '완료일',    width: 80  },
]

function formatShortDate(iso: string | null | undefined) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

interface TableRowProps {
  task: Task
  onToggle: () => void
  onOpen: () => void
  onNoDeadlineToggle?: () => void
  onMemoryToggle?: () => void
}

function TableRow({ task, onToggle, onOpen, onNoDeadlineToggle, onMemoryToggle }: TableRowProps) {
  // 스페이스+클릭은 TaskItem과 동일하게 모듈레벨 spaceHeld 쓰지 못하므로
  // 여기선 버튼에 title로 안내, 클릭 시 바로 toggle
  const done = task.is_done && !(task.is_no_deadline ?? false)
  return (
    <tr
      onClick={onOpen}
      style={{ cursor: 'pointer', borderBottom: '1px solid #f0efed' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#fafaf9' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
    >
      {/* 상태 아이콘 */}
      <td style={{ width: 36, padding: '0 8px', textAlign: 'center', verticalAlign: 'middle' }}>
        <button
          title="스페이스+클릭으로 완료 토글"
          onClick={e => { e.stopPropagation(); onToggle() }}
          style={{
            width: 22, height: 22, borderRadius: 6, border: `1.5px solid ${done ? '#aaa' : '#ccc'}`,
            background: done ? '#e8e8e6' : '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, cursor: 'pointer', flexShrink: 0,
            color: done ? '#888' : 'transparent',
          }}
        >
          {task.icon ? task.icon : done ? '✓' : ''}
        </button>
      </td>
      {/* 제목 */}
      <td style={{ padding: '8px 6px', verticalAlign: 'middle', maxWidth: 0 }}>
        <span style={{
          display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontSize: 13, color: done ? '#aaa' : '#37352f',
        }}>
          {task.title || '제목 없음'}
        </span>
      </td>
      {/* 태그 */}
      <td style={{ width: 80, padding: '8px 6px', verticalAlign: 'middle' }}>
        {task.tag ? (
          <span style={{
            fontSize: 11, padding: '2px 6px', borderRadius: 10,
            background: '#f0efed', color: '#787774', whiteSpace: 'nowrap',
          }}>{task.tag}</span>
        ) : null}
      </td>
      {/* 속성 플래그 */}
      <td style={{ width: 100, padding: '8px 4px', verticalAlign: 'middle' }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'nowrap' }}>
          {(task.is_no_deadline ?? false) && (
            <span
              onClick={e => { e.stopPropagation(); onNoDeadlineToggle?.() }}
              style={{
                fontSize: 10, padding: '2px 6px', borderRadius: 10, cursor: 'pointer',
                background: '#e4e4e4', color: '#555', border: '1px solid #ccc',
              }}
            >기약없음</span>
          )}
          {(task.is_memory ?? false) && (
            <span
              onClick={e => { e.stopPropagation(); onMemoryToggle?.() }}
              style={{
                fontSize: 10, padding: '2px 6px', borderRadius: 10, cursor: 'pointer',
                background: '#FFE8D0', color: '#C96A1A', border: '1px solid #f0c49a',
              }}
            >기억용</span>
          )}
        </div>
      </td>
      {/* 생성일 */}
      <td style={{ width: 80, padding: '8px 6px', verticalAlign: 'middle', color: '#aaa', fontSize: 12, whiteSpace: 'nowrap' }}>
        {formatShortDate(task.created_at)}
      </td>
      {/* 완료일 */}
      <td style={{ width: 80, padding: '8px 6px', verticalAlign: 'middle', color: '#aaa', fontSize: 12, whiteSpace: 'nowrap' }}>
        {formatShortDate(task.done_at)}
      </td>
    </tr>
  )
}

interface TaskTableProps {
  tasks: Task[]
  onToggle: (task: Task) => void
  onOpen: (task: Task) => void
  onNoDeadlineToggle: (task: Task) => void
  onMemoryToggle: (task: Task) => void
}

function TaskTable({ tasks, onToggle, onOpen, onNoDeadlineToggle, onMemoryToggle }: TaskTableProps) {
  if (tasks.length === 0) return null
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
      <colgroup>
        {TABLE_COLS.map(c => (
          <col key={c.key} style={{ width: c.width === 'auto' ? undefined : c.width }} />
        ))}
      </colgroup>
      <thead>
        <tr style={{ borderBottom: '1px solid #e3e2e0' }}>
          {TABLE_COLS.map(c => (
            <th key={c.key} style={{
              padding: '6px 6px', textAlign: 'left', fontSize: 11,
              color: '#aaa', fontWeight: 500, whiteSpace: 'nowrap',
            }}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {tasks.map(task => (
          <TableRow
            key={task.id}
            task={task}
            onToggle={() => onToggle(task)}
            onOpen={() => onOpen(task)}
            onNoDeadlineToggle={() => onNoDeadlineToggle(task)}
            onMemoryToggle={() => onMemoryToggle(task)}
          />
        ))}
      </tbody>
    </table>
  )
}
// ─────────────────────────────────────────────────────────────

function SalesforceIcon() {
  return (
    <svg width="18" height="14" viewBox="0 0 100 76" xmlns="http://www.w3.org/2000/svg">
      <path d="M41 14C44.5 9.5 50 7 56 7C66 7 74.2 14 75.5 23.2C76.5 22.6 77.8 22.2 79.2 22.2C84.8 22.2 89.3 26.7 89.3 32.3C89.3 32.9 89.2 33.5 89.1 34C93.6 35.8 96.8 40.2 96.8 45.3C96.8 52.2 91.2 57.8 84.3 57.8H17.2C9.9 57.8 4 51.9 4 44.6C4 38.8 7.6 33.8 12.8 31.8C12.6 30.9 12.5 29.9 12.5 28.9C12.5 22.4 17.8 17.1 24.3 17.1C27.8 17.1 31 18.6 33.2 21C35.2 16.9 37.9 14 41 14Z" fill="#1589EE"/>
    </svg>
  )
}

interface SectionCardProps {
  bg: string
  title: string
  titleColor: string
  dateRange: string
  dateColor: string
  icon?: React.ReactNode
  iconFlush?: boolean
  isDragOver?: boolean
  children: React.ReactNode
}

function SectionCard({ bg, title, titleColor, dateRange, dateColor, icon, iconFlush, isDragOver, children }: SectionCardProps) {
  const { ref, style } = useSmoothCorners(22)
  return (
    <div ref={ref} style={{
      backgroundColor: bg,
      ...style,
      borderRadius: 22,
      outline: 'none',
    }}>
      <div className={`${iconFlush ? 'pl-0' : 'pl-5'} pr-5 py-3 flex items-center ${iconFlush ? 'gap-1' : 'gap-2'}`} style={undefined}>
        {icon && <span className="flex-shrink-0">{icon}</span>}
        <span className="text-sm font-extrabold" style={{ color: titleColor, marginLeft: iconFlush ? '-3px' : undefined }}>{title}</span>
        {dateRange && <span className="text-xs font-medium" style={{ color: dateColor }}>{dateRange}</span>}
      </div>
      <div style={iconFlush ? { marginTop: '10px' } : undefined}>
        {children}
        {isDragOver && (
          <div className="px-3 pb-3">
            <div style={{ height: 2, borderRadius: 1, background: 'rgba(59,130,246,0.55)', transition: 'opacity 0.1s' }} />
          </div>
        )}
      </div>
    </div>
  )
}

export default function TaskSection({ tasks, setTasks, userId, supabase, categoryFilter, fixedOffset, sortKey = null, sortDir = 'desc', viewMode = 'card', sharedSelectedIds, sharedSetSelectedIds, sharedLastSelectedId, sharedSetLastSelectedId }: Props) {
  const [input, setInput] = useState('')
  const [inputFocused, setInputFocused] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)

  const sortTasks = useCallback(<T extends Task>(list: T[]): T[] => {
    if (!sortKey) return list
    return [...list].sort((a, b) => {
      const av = sortKey === 'title' ? a.title : sortKey === 'done_at' ? (a.done_at ?? '') : a.created_at
      const bv = sortKey === 'title' ? b.title : sortKey === 'done_at' ? (b.done_at ?? '') : b.created_at
      const cmp = av < bv ? -1 : av > bv ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [sortKey, sortDir])

  // ─── 선택 모드 (공유 또는 로컬 fallback) ──────────
  const [localSelectedIds, localSetSelectedIds] = useState<Set<string>>(new Set())
  const [localLastSelectedId, localSetLastSelectedId] = useState<string | null>(null)
  const selectedIds = sharedSelectedIds ?? localSelectedIds
  const setSelectedIds = sharedSetSelectedIds ?? localSetSelectedIds
  const lastSelectedId = sharedLastSelectedId !== undefined ? sharedLastSelectedId : localLastSelectedId
  const setLastSelectedId = sharedSetLastSelectedId ?? localSetLastSelectedId

  // ─── 드래그 & 드롭 ────────────────────────────────
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)
  const [dropSlot, setDropSlot] = useState<{ sectionKey: string; slotIdx: number } | null>(null)
  const [draggingIds, setDraggingIds] = useState<Set<string>>(new Set())

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault()
    const title = input.trim()
    if (!title) return
    const maxOrder = filteredTasks.reduce((max, t) => Math.max(max, t.sort_order ?? 0), 0)
    const { data, error } = await supabase
      .from('tasks')
      .insert({ title, user_id: userId, category: categoryFilter ?? 'work', sort_order: maxOrder + 10 })
      .select()
      .single()
    if (!error && data) {
      setTasks([data, ...tasks])
      setInput('')
    }
  }

  async function handleToggleDone(task: Task, noDate?: boolean) {
    const is_done = !task.is_done
    const done_at = (is_done && !noDate) ? new Date().toISOString() : null
    setTasks(tasks.map(t => t.id === task.id ? { ...t, is_done, done_at } : t))
    await supabase.from('tasks').update({ is_done, done_at }).eq('id', task.id)
  }

  async function handleDelete(taskId: string) {
    setTasks(tasks.filter(t => t.id !== taskId))
    await supabase.from('tasks').delete().eq('id', taskId)
  }

  async function handleRename(task: Task, title: string) {
    setTasks(tasks.map(t => t.id === task.id ? { ...t, title } : t))
    if (selectedTask?.id === task.id) setSelectedTask(prev => prev ? { ...prev, title } : prev)
    await supabase.from('tasks').update({ title }).eq('id', task.id)
  }

  async function handleSubtaskRename(task: Task, itemIndex: number, newText: string) {
    const newDesc = renameSubtaskItem(task.description, itemIndex, newText)
    const updated: Task = { ...task, description: newDesc as object }
    setTasks(tasks.map(t => t.id === task.id ? updated : t))
    if (selectedTask?.id === task.id) setSelectedTask(updated)
    await supabase.from('tasks').update({ description: newDesc }).eq('id', task.id)
  }

  async function handleSubtaskToggle(task: Task, itemIndex: number, noDate?: boolean) {
    const newDesc = toggleSubtaskChecked(task.description, itemIndex, noDate)
    const stats = getCheckboxStats(newDesc as object | null)
    const is_done = stats.total > 0 && stats.checked === stats.total
    const done_at = (is_done && !noDate) ? new Date().toISOString() : null
    const updated: Task = { ...task, description: newDesc as object, is_done, done_at }
    setTasks(tasks.map(t => t.id === task.id ? updated : t))
    if (selectedTask?.id === task.id) setSelectedTask(updated)
    await supabase.from('tasks').update({ description: newDesc, is_done, done_at }).eq('id', task.id)
  }

  async function handleSubtaskDelete(task: Task, itemIndex: number) {
    const newDesc = deleteSubtaskItem(task.description, itemIndex)
    const stats = getCheckboxStats(newDesc as object | null)
    const is_done = stats.total > 0 && stats.checked === stats.total
    const done_at = is_done ? new Date().toISOString() : null
    const updated: Task = { ...task, description: newDesc as object, is_done, done_at }
    setTasks(tasks.map(t => t.id === task.id ? updated : t))
    if (selectedTask?.id === task.id) setSelectedTask(updated)
    await supabase.from('tasks').update({ description: newDesc, is_done, done_at }).eq('id', task.id)
  }

  async function handleSubtaskAdd(task: Task, afterOrigIdx: number, text: string) {
    const newDesc = addSubtaskAfter(task.description, afterOrigIdx, text)
    const updated: Task = { ...task, description: newDesc as object }
    setTasks(tasks.map(t => t.id === task.id ? updated : t))
    if (selectedTask?.id === task.id) setSelectedTask(updated)
    await supabase.from('tasks').update({ description: newDesc }).eq('id', task.id)
  }

  async function handleNoteChange(task: Task, note: string) {
    setTasks(tasks.map(t => t.id === task.id ? { ...t, note } : t))
    if (selectedTask?.id === task.id) setSelectedTask(prev => prev ? { ...prev, note } : prev)
    await supabase.from('tasks').update({ note }).eq('id', task.id)
  }

  async function handleSubtaskDateChange(task: Task, itemIndex: number, checkedAt: string | null) {
    const newDesc = setSubtaskCheckedAt(task.description, itemIndex, checkedAt)
    const items = getSubtaskItems(newDesc)
    const latestCheckedAt = items
      .filter(i => i.checked && i.checkedAt)
      .reduce<string | null>((max, i) => (!max || i.checkedAt! > max ? i.checkedAt! : max), null)
    const done_at = latestCheckedAt
    const updated: Task = { ...task, description: newDesc as object, done_at }
    setTasks(tasks.map(t => t.id === task.id ? updated : t))
    if (selectedTask?.id === task.id) setSelectedTask(updated)
    await supabase.from('tasks').update({ description: newDesc, done_at }).eq('id', task.id)
  }

  function handleTaskUpdate(updated: Task) {
    setTasks(tasks.map(t => t.id === updated.id ? updated : t))
    if (selectedTask?.id === updated.id) setSelectedTask(updated)
  }

  async function handleFirstSubtaskCreate(task: Task, text: string) {
    const newDesc = {
      type: 'doc',
      content: [{
        type: 'taskList',
        content: [{
          type: 'taskItem',
          attrs: { checked: false },
          content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
        }]
      }]
    }
    const updated: Task = { ...task, description: newDesc as object }
    setTasks(tasks.map(t => t.id === task.id ? updated : t))
    if (selectedTask?.id === task.id) setSelectedTask(updated)
    await supabase.from('tasks').update({ description: newDesc }).eq('id', task.id)
  }

  async function handleDropWithSlot(
    taskIds: string[],
    targetOffset: number,
    targetCat: 'work' | 'personal',
    slotIdx: number,
    targetEntries: SectionEntry[]
  ) {
    const taskIdSet = new Set(taskIds)

    // null sort_order를 위치 기반 정수로 정규화해서 정렬 오류 방지
    const normalized = targetEntries.map((e, i) => ({
      task: e.task,
      order: e.task.sort_order ?? (i + 1) * 1000,
    }))

    const nonMoved = normalized.filter(e => !taskIdSet.has(e.task.id))
    const insertAfterCount = normalized.slice(0, slotIdx).filter(e => !taskIdSet.has(e.task.id)).length
    const beforeItem = insertAfterCount > 0 ? nonMoved[insertAfterCount - 1] : null
    const afterItem = nonMoved[insertAfterCount] ?? null

    const beforeOrder = beforeItem?.order ?? null
    const afterOrder = afterItem?.order ?? null
    let baseOrder: number
    if (beforeOrder === null && afterOrder === null) baseOrder = 1000
    else if (beforeOrder === null) baseOrder = afterOrder! - 10
    else if (afterOrder === null) baseOrder = beforeOrder + 10
    else baseOrder = (beforeOrder + afterOrder) / 2

    const updatedTasks = [...tasks]
    for (let i = 0; i < taskIds.length; i++) {
      const taskId = taskIds[i]
      const idx = updatedTasks.findIndex(t => t.id === taskId)
      if (idx < 0) continue
      const task = updatedTasks[idx]
      const newSortOrder = baseOrder + i * 0.001

      const updates: Record<string, unknown> = { category: targetCat, sort_order: newSortOrder }

      if (targetOffset === 0) {
        updates.is_done = false
        updates.done_at = null
      } else {
        const d = getWeekStartDate(targetOffset)
        d.setHours(12, 0, 0, 0)
        updates.done_at = d.toISOString()
        updates.is_done = true
      }

      const allItems = getSubtaskItems(task.description)
      if (allItems.length > 0 && targetOffset > 0) {
        let desc = task.description
        allItems.forEach((item, j) => {
          if (item.checked) desc = setSubtaskCheckedAt(desc, j, updates.done_at as string) as object
        })
        updates.description = desc
      }

      updatedTasks[idx] = { ...task, ...updates } as Task
      await supabase.from('tasks').update(updates).eq('id', taskId)
    }

    // sort_order 기준으로 재정렬
    updatedTasks.sort((a, b) => (a.sort_order ?? Infinity) - (b.sort_order ?? Infinity))
    setTasks(updatedTasks)
    setSelectedIds(new Set())
    setDropSlot(null)
    setDragOverKey(null)
  }

  // ─── 섹션 내 순서 재정렬 — 섹션 전체를 재정규화해 null sort_order 충돌 방지 ──
  async function handleReorderTasks(taskIds: string[], slotIdx: number, sectionTasks: Task[]) {
    const taskIdSet = new Set(taskIds)

    // 이동할 카드(순서 보존) / 나머지 카드 분리
    const moved    = taskIds.map(id => sectionTasks.find(t => t.id === id)).filter(Boolean) as Task[]
    const nonMoved = sectionTasks.filter(t => !taskIdSet.has(t.id))

    // slotIdx는 원본 배열 기준 → nonMoved 기준 삽입 위치 계산
    const insertIdx = sectionTasks.slice(0, slotIdx).filter(t => !taskIdSet.has(t.id)).length

    // 새 순서 배열
    const newOrder: Task[] = [
      ...nonMoved.slice(0, insertIdx),
      ...moved,
      ...nonMoved.slice(insertIdx),
    ]

    // 섹션 전체를 1000, 2000, 3000… 으로 재정규화 (null 혼재 문제 해결)
    const updatedTasks = [...tasks]
    const dbUpdates: Array<{ id: string; sort_order: number }> = []

    newOrder.forEach((task, i) => {
      const newSortOrder = (i + 1) * 1000
      const idx = updatedTasks.findIndex(t => t.id === task.id)
      if (idx >= 0) {
        updatedTasks[idx] = { ...updatedTasks[idx], sort_order: newSortOrder }
        dbUpdates.push({ id: task.id, sort_order: newSortOrder })
      }
    })

    setTasks(updatedTasks)
    setSelectedIds(new Set())
    setDropSlot(null)
    setDragOverKey(null)
    setDraggingIds(new Set())

    // Supabase 병렬 업데이트
    await Promise.all(dbUpdates.map(({ id, sort_order }) =>
      supabase.from('tasks').update({ sort_order }).eq('id', id)
    ))
  }

  // 카테고리 필터링
  const filteredTasks = categoryFilter === 'personal'
    ? tasks.filter(t => t.category === 'personal')
    : tasks.filter(t => t.category !== 'personal')

  // 기억용 / 기약없음 / 일반 분리
  // is_memory: 별도 '기억' 섹션에 고정 (done 여부 무관)
  // is_no_deadline: done이어도 '할 일' 섹션에 잔류
  const memoryTasks  = filteredTasks.filter(t => t.is_memory ?? false)
  const nonMemory    = filteredTasks.filter(t => !(t.is_memory ?? false))
  const pendingTasks = nonMemory.filter(t => !t.is_done || (t.is_no_deadline ?? false))
  const doneTasks    = nonMemory.filter(t => t.is_done && !(t.is_no_deadline ?? false))

  const sectionMap = buildSectionMap(doneTasks)
  const sortedOffsets = Array.from(sectionMap.keys()).sort((a, b) => a - b)

  // fixedOffset 지정 시 해당 offset만, 개인 섹션은 offset=0만, 업무 섹션은 모든 offset
  const displayOffsets = fixedOffset !== undefined ? [fixedOffset] : categoryFilter === 'personal' ? [0] : sortedOffsets

  // 표시 순서대로 고유 task ID 목록 (shift+범위 선택용) — memory → pending → week 순
  const orderedTaskIds = useMemo(() => {
    const seen = new Set<string>()
    const ids: string[] = []
    memoryTasks.forEach(t => { if (!seen.has(t.id)) { seen.add(t.id); ids.push(t.id) } })
    pendingTasks.forEach(t => { if (!seen.has(t.id)) { seen.add(t.id); ids.push(t.id) } })
    displayOffsets.forEach(offset => {
      sectionMap.get(offset)?.forEach(({ task }) => {
        if (!seen.has(task.id)) { seen.add(task.id); ids.push(task.id) }
      })
    })
    return ids
  }, [memoryTasks, pendingTasks, sectionMap, displayOffsets])

  function handleSelect(taskId: string, shiftKey: boolean) {
    if (shiftKey && lastSelectedId && lastSelectedId !== taskId) {
      const a = orderedTaskIds.indexOf(lastSelectedId)
      const b = orderedTaskIds.indexOf(taskId)
      if (a >= 0 && b >= 0) {
        const [from, to] = a < b ? [a, b] : [b, a]
        const range = orderedTaskIds.slice(from, to + 1)
        setSelectedIds(prev => { const next = new Set(prev); range.forEach(id => next.add(id)); return next })
      }
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev)
        next.has(taskId) ? next.delete(taskId) : next.add(taskId)
        return next
      })
      setLastSelectedId(taskId)
    }
  }

  async function handleCreatedAtChange(task: Task, iso: string) {
    setTasks(tasks.map(t => t.id === task.id ? { ...t, created_at: iso } : t))
    await supabase.from('tasks').update({ created_at: iso }).eq('id', task.id)
  }

  async function handleTagChange(task: Task, tag: string | null) {
    setTasks(tasks.map(t => t.id === task.id ? { ...t, tag } : t))
    await supabase.from('tasks').update({ tag }).eq('id', task.id)
  }

  async function handleIconChange(task: Task, icon: string | null) {
    setTasks(tasks.map(t => t.id === task.id ? { ...t, icon } : t))
    await supabase.from('tasks').update({ icon }).eq('id', task.id)
  }

  async function handleNoDeadlineToggle(task: Task) {
    const is_no_deadline = !task.is_no_deadline
    setTasks(tasks.map(t => t.id === task.id ? { ...t, is_no_deadline } : t))
    await supabase.from('tasks').update({ is_no_deadline }).eq('id', task.id)
  }

  async function handleMemoryToggle(task: Task) {
    const is_memory = !task.is_memory
    setTasks(tasks.map(t => t.id === task.id ? { ...t, is_memory } : t))
    await supabase.from('tasks').update({ is_memory }).eq('id', task.id)
  }

  const availableTags = useMemo(() => {
    const tags = new Set<string>()
    tasks.forEach(t => { if (t.tag) tags.add(t.tag) })
    return Array.from(tags)
  }, [tasks])

  function taskItemProps(task: Task, visibleOrigIndices: Set<number> | undefined, cardBorderColor: string) {
    return {
      task,
      cardBorderColor,
      onToggle: (noDate?: boolean) => handleToggleDone(task, noDate),
      onDelete: () => handleDelete(task.id),
      onClick: () => setSelectedTask(task),
      onRename: (title: string) => handleRename(task, title),
      onSubtaskToggle: (idx: number, noDate?: boolean) => handleSubtaskToggle(task, idx, noDate),
      onSubtaskRename: (idx: number, text: string) => handleSubtaskRename(task, idx, text),
      onSubtaskAdd: (afterIdx: number, text: string) => handleSubtaskAdd(task, afterIdx, text),
      onSubtaskDelete: (idx: number) => handleSubtaskDelete(task, idx),
      onSubtaskDateChange: (idx: number, checkedAt: string | null) => handleSubtaskDateChange(task, idx, checkedAt),
      onNoteChange: (note: string) => handleNoteChange(task, note),
      onFirstSubtaskCreate: (text: string) => handleFirstSubtaskCreate(task, text),
      onCreatedAtChange: (iso: string) => handleCreatedAtChange(task, iso),
      availableTags,
      onTagChange: (tag: string | null) => handleTagChange(task, tag),
      onIconChange: (icon: string | null) => handleIconChange(task, icon),
      onNoDeadlineToggle: () => handleNoDeadlineToggle(task),
      onMemoryToggle: () => handleMemoryToggle(task),
      visibleOrigIndices,
      selected: selectedIds.has(task.id),
      selectionActive: selectedIds.size > 0,
      onSelect: (shiftKey: boolean) => handleSelect(task.id, shiftKey),
    }
  }

  return (
    <section className="flex flex-col gap-3 p-3">
      {/* 새 할 일 입력 폼 */}
      <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
        <div
          style={{
            flex: 1,
            borderRadius: 8,
            background: inputFocused ? '#ffffff' : '#EDEDED',
            border: inputFocused ? '1px solid rgba(0,0,0,0.12)' : '1px solid transparent',
            transition: 'background 0.15s, border-color 0.15s',
          }}
        >
          <form
            onSubmit={handleAddTask}
            className="flex items-center gap-3 px-3 py-2"
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
          >
            <Plus size={14} className="text-[#9b9a97] flex-shrink-0" />
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="새 할 일 추가..."
              className="flex-1 text-sm text-[#37352f] placeholder:text-[#9b9a97] bg-transparent focus:outline-none"
            />
          </form>
        </div>
      </div>

      {/* 할 일 섹션 — 미완료 태스크 */}
      {(fixedOffset === undefined) && pendingTasks.length > 0 && (() => {
        const sectionKey = `pending-${categoryFilter ?? 'work'}`
        const sorted = sortKey
          ? sortTasks(pendingTasks)
          : [...pendingTasks].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        return (
          <div
            onDragOver={e => { e.preventDefault(); setDragOverKey(sectionKey) }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverKey(null) }}
            onDrop={e => {
              e.preventDefault()
              const ids = parseTaskIds(e.dataTransfer.getData('text/plain'))
              if (ids) handleReorderTasks(ids, sorted.length, sorted)
            }}
          >
            <SectionCard bg="#FFFFFF" title={categoryFilter === 'personal' ? '할 일' : '할 업무'} titleColor="#030301" dateRange="" dateColor="#9b9a97" iconFlush={false}>
              {viewMode === 'table' ? (
                <div style={{ padding: '0 8px 8px' }}>
                  <TaskTable
                    tasks={sorted}
                    onToggle={t => handleToggleDone(t)}
                    onOpen={t => setSelectedTask(t)}
                    onNoDeadlineToggle={t => handleNoDeadlineToggle(t)}
                    onMemoryToggle={t => handleMemoryToggle(t)}
                  />
                </div>
              ) : (
                <MasonryGrid items={[
                  ...sorted.flatMap((task, flatIdx) => [
                    ...(dropSlot?.sectionKey === sectionKey && dropSlot.slotIdx === flatIdx ? [<GhostCard key={`g${flatIdx}`} />] : []),
                    <div key={task.id} draggable
                      onDragStart={e => {
                        const ids = selectedIds.has(task.id) && selectedIds.size > 1 ? [...selectedIds] : [task.id]
                        e.dataTransfer.setData('text/plain', JSON.stringify(ids))
                        e.dataTransfer.effectAllowed = 'move'
                        setDraggingIds(new Set(ids))
                      }}
                      onDragEnd={() => { setDropSlot(null); setDragOverKey(null); setDraggingIds(new Set()) }}
                      onDragOver={e => {
                        e.preventDefault(); e.stopPropagation()
                        const rect = e.currentTarget.getBoundingClientRect()
                        const slot = e.clientY < rect.top + rect.height / 2 ? flatIdx : flatIdx + 1
                        setDropSlot({ sectionKey, slotIdx: slot }); setDragOverKey(sectionKey)
                      }}
                      onDrop={e => {
                        e.preventDefault(); e.stopPropagation()
                        const ids = parseTaskIds(e.dataTransfer.getData('text/plain'))
                        if (!ids) return
                        const rect = e.currentTarget.getBoundingClientRect()
                        const slot = e.clientY < rect.top + rect.height / 2 ? flatIdx : flatIdx + 1
                        setDropSlot(null); handleReorderTasks(ids, slot, sorted)
                      }}
                      style={{ cursor: 'grab', opacity: draggingIds.has(task.id) ? 0.35 : 1, transition: 'opacity 0.15s' }}
                    >
                      <TaskItem {...taskItemProps(task, undefined, '')} />
                    </div>,
                  ]),
                  ...(dropSlot?.sectionKey === sectionKey && dropSlot.slotIdx === sorted.length ? [<GhostCard key="g-tail" />] : []),
                ]} />
              )}
            </SectionCard>
          </div>
        )
      })()}

      {/* 기억 섹션 — is_memory 태스크 (done 여부 무관) */}
      {fixedOffset === undefined && memoryTasks.length > 0 && (() => {
        const sectionKey = `memory-${categoryFilter ?? 'work'}`
        const sorted = sortKey
          ? sortTasks(memoryTasks)
          : [...memoryTasks].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        return (
          <div
            onDragOver={e => { e.preventDefault(); setDragOverKey(sectionKey) }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverKey(null) }}
            onDrop={e => {
              e.preventDefault()
              const ids = parseTaskIds(e.dataTransfer.getData('text/plain'))
              if (ids) handleReorderTasks(ids, sorted.length, sorted)
            }}
          >
            <SectionCard bg="#FFF8F2" title="기억해두기" titleColor="#C96A1A" dateRange="" dateColor="#C96A1A" iconFlush={false}>
              {viewMode === 'table' ? (
                <div style={{ padding: '0 8px 8px' }}>
                  <TaskTable
                    tasks={sorted}
                    onToggle={t => handleToggleDone(t)}
                    onOpen={t => setSelectedTask(t)}
                    onNoDeadlineToggle={t => handleNoDeadlineToggle(t)}
                    onMemoryToggle={t => handleMemoryToggle(t)}
                  />
                </div>
              ) : (
                <MasonryGrid items={[
                  ...sorted.flatMap((task, flatIdx) => [
                    ...(dropSlot?.sectionKey === sectionKey && dropSlot.slotIdx === flatIdx ? [<GhostCard key={`g${flatIdx}`} />] : []),
                    <div key={task.id} draggable
                      onDragStart={e => {
                        const ids = selectedIds.has(task.id) && selectedIds.size > 1 ? [...selectedIds] : [task.id]
                        e.dataTransfer.setData('text/plain', JSON.stringify(ids))
                        e.dataTransfer.effectAllowed = 'move'
                        setDraggingIds(new Set(ids))
                      }}
                      onDragEnd={() => { setDropSlot(null); setDragOverKey(null); setDraggingIds(new Set()) }}
                      onDragOver={e => {
                        e.preventDefault(); e.stopPropagation()
                        const rect = e.currentTarget.getBoundingClientRect()
                        const slot = e.clientY < rect.top + rect.height / 2 ? flatIdx : flatIdx + 1
                        setDropSlot({ sectionKey, slotIdx: slot }); setDragOverKey(sectionKey)
                      }}
                      onDrop={e => {
                        e.preventDefault(); e.stopPropagation()
                        const ids = parseTaskIds(e.dataTransfer.getData('text/plain'))
                        if (!ids) return
                        const rect = e.currentTarget.getBoundingClientRect()
                        const slot = e.clientY < rect.top + rect.height / 2 ? flatIdx : flatIdx + 1
                        setDropSlot(null); handleReorderTasks(ids, slot, sorted)
                      }}
                      style={{ cursor: 'grab', opacity: draggingIds.has(task.id) ? 0.35 : 1, transition: 'opacity 0.15s' }}
                    >
                      <TaskItem {...taskItemProps(task, undefined, '')} />
                    </div>,
                  ]),
                  ...(dropSlot?.sectionKey === sectionKey && dropSlot.slotIdx === sorted.length ? [<GhostCard key="g-tail" />] : []),
                ]} />
              )}
            </SectionCard>
          </div>
        )
      })()}

      {displayOffsets.map(offset => {
        const entries = sectionMap.get(offset) ?? []
        const bg = offset === 0 ? '#EDEDED' : offset === 1 ? '#FBF5FF' : offset === 2 ? '#EDF2FF' : '#F1F1F1'
        const baseTitle =
          offset === 0 ? '이번주에 한' :
          offset === 1 ? '저번주에 한' :
          offset === 2 ? '저저번주에 한' :
          `${formatOldWeekTitle(offset)}에 한`
        const title = categoryFilter === 'personal'
          ? '이번주에 한 일'
          : `${baseTitle} 업무`
        const titleColor =
          offset === 0 ? '#030301' :
          offset === 1 ? '#7A32BA' :
          offset === 2 ? '#4F42C8' :
          '#646464'
        const dateRange = formatWeekRange(offset)

        const borderColor =
          offset === 0 ? '#F3D6B7' :
          offset === 1 ? '#DFD3F2' :
          offset === 2 ? '#C9D1F3' :
          '#e3e2e0'
        const dateColor =
          offset === 1 ? '#B08FD8' :
          offset === 2 ? '#8898E0' :
          '#9b9a97'

        const sectionKey = `${offset}-${categoryFilter ?? 'work'}`
        const isWork = categoryFilter !== 'personal'

        return (
          <div
            key={offset}
            style={undefined}
            onDragOver={e => { e.preventDefault(); setDragOverKey(sectionKey) }}
            onDragLeave={e => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverKey(null)
            }}
            onDrop={e => {
              e.preventDefault()
              const ids = parseTaskIds(e.dataTransfer.getData('text/plain'))
              if (ids) handleDropWithSlot(ids, offset, categoryFilter ?? 'work', entries.length, entries)
            }}
          >
            <SectionCard
              bg={bg ?? '#ffffff'}
              title={title}
              titleColor={titleColor}
              dateRange={categoryFilter === 'personal' ? (offset === 0 ? formatPersonalWeekRange() : '') : dateRange}
              dateColor={dateColor}
              iconFlush={false}
              isDragOver={dragOverKey === sectionKey}
            >
              {(() => {
                const sortedEntries = sortKey
                  ? sortTasks(entries.map(e => e.task)).map(t => entries.find(e => e.task.id === t.id)!)
                  : [...entries].sort((a, b) => estimateCardHeight(a.task, a.visibleOrigIndices) - estimateCardHeight(b.task, b.visibleOrigIndices))
                return viewMode === 'table' ? (
                  <div style={{ padding: '0 8px 8px' }}>
                    <TaskTable
                      tasks={sortedEntries.map(e => e.task)}
                      onToggle={t => handleToggleDone(t)}
                      onOpen={t => setSelectedTask(t)}
                      onNoDeadlineToggle={t => handleNoDeadlineToggle(t)}
                      onMemoryToggle={t => handleMemoryToggle(t)}
                    />
                  </div>
                ) : (
                  <MasonryGrid items={[
                    ...sortedEntries.flatMap(({ task, visibleOrigIndices }, flatIdx) => [
                      ...(dropSlot?.sectionKey === sectionKey && dropSlot.slotIdx === flatIdx ? [<GhostCard key={`g${flatIdx}`} />] : []),
                      <div key={`${task.id}-${offset}`} draggable
                        onDragStart={e => {
                          const ids = selectedIds.has(task.id) && selectedIds.size > 1 ? [...selectedIds] : [task.id]
                          e.dataTransfer.setData('text/plain', JSON.stringify(ids))
                          e.dataTransfer.effectAllowed = 'move'
                          setDraggingIds(new Set(ids))
                        }}
                        onDragEnd={() => { setDropSlot(null); setDragOverKey(null); setDraggingIds(new Set()) }}
                        onDragOver={e => {
                          e.preventDefault(); e.stopPropagation()
                          const rect = e.currentTarget.getBoundingClientRect()
                          const slot = e.clientY < rect.top + rect.height / 2 ? flatIdx : flatIdx + 1
                          setDropSlot({ sectionKey, slotIdx: slot }); setDragOverKey(sectionKey)
                        }}
                        onDrop={e => {
                          e.preventDefault(); e.stopPropagation()
                          const ids = parseTaskIds(e.dataTransfer.getData('text/plain'))
                          if (!ids) return
                          const rect = e.currentTarget.getBoundingClientRect()
                          const slot = e.clientY < rect.top + rect.height / 2 ? flatIdx : flatIdx + 1
                          setDropSlot(null); handleDropWithSlot(ids, offset, categoryFilter ?? 'work', slot, entries)
                        }}
                        style={{ cursor: 'grab', opacity: draggingIds.has(task.id) ? 0.35 : 1, transition: 'opacity 0.15s' }}
                      >
                        <TaskItem {...taskItemProps(task, visibleOrigIndices, '')} />
                      </div>,
                    ]),
                    ...(dropSlot?.sectionKey === sectionKey && dropSlot.slotIdx === entries.length ? [<GhostCard key="g-tail" />] : []),
                  ]} />
                )
              })()}
            </SectionCard>
          </div>
        )
      })}

      {displayOffsets.length === 0 && categoryFilter !== 'personal' && (
        <p className="py-8 text-sm text-[#9b9a97] text-center">위에서 할 일을 추가해보세요</p>
      )}

      {/* 상세 캔버스 — 항상 전체 서브태스크 표시 */}
      {selectedTask && (
        <TaskCanvas
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={handleTaskUpdate}
          supabase={supabase}
        />
      )}
    </section>
  )
}
