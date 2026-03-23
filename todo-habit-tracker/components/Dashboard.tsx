'use client'

import { useState, useRef, useCallback, useMemo, useEffect, useLayoutEffect } from 'react'
import { User } from '@supabase/supabase-js'
import { Task } from '@/types'
import { createClient } from '@/lib/supabase/client'
import TaskSection from './tasks/TaskSection'
import MeetingTab from './meeting/MeetingTab'
import GoogleCalendarTab from './calendar/GoogleCalendarTab'
import { Search, X, Trash2, FolderInput, Users, User as UserIcon, LayoutGrid, ArrowUpDown, ArrowUp, ArrowDown, Table2, LayoutDashboard, CalendarClock, CalendarDays } from 'lucide-react'
import { useSmoothCorners } from '@/hooks/useSmoothCorners'
import { getSubtaskItems, setSubtaskCheckedAt } from '@/lib/taskItems'

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

function formatOldWeekTitle(offset: number): string {
  const start = getWeekStartDate(offset)
  const sm = start.getMonth() + 1
  const sd = start.getDate()
  const weekNum = Math.ceil(sd / 7)
  return `${sm}월 ${weekNum}째주`
}

interface Props {
  user: User
  initialTasks: Task[]
}

export default function Dashboard({ user, initialTasks }: Props) {
  const supabase = createClient()
  const [tasks, setTasks] = useState<Task[]>(initialTasks)

  // ─── 모바일 감지 ─────────────────────────────────
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const [personalRatio, setPersonalRatio] = useState(0.3)
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(800)
  const personalWidth = Math.max(160, Math.round(containerWidth * personalRatio))
  const [resizing, setResizing] = useState(false)
  const [handleHovered, setHandleHovered] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  const filteredTasks = searchQuery.trim()
    ? tasks.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : tasks
  // ─── 공유 선택 상태 ─────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null)
  const [showFolderMenu, setShowFolderMenu] = useState(false)
  const [folderHovered, setFolderHovered] = useState(false)
  const [notionHovered, setNotionHovered] = useState(false)
  const [activeTab, setActiveTab] = useState<'all' | 'personal' | 'work' | 'weekly' | 'meeting' | 'calendar'>('all')

  // ─── 뷰 모드 ─────────────────────────────────────
  type ViewMode = 'card' | 'table'
  const [viewMode, setViewMode] = useState<ViewMode>('card')

  // ─── 전역 정렬 (모든 섹션 동시 적용) ─────────────
  type SortKey = 'created_at' | 'title' | 'done_at'
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [showSortMenu, setShowSortMenu] = useState(false)
  const [sortMenuPos, setSortMenuPos] = useState<{ top: number; right: number } | null>(null)
  const sortBtnRef = useRef<HTMLButtonElement>(null)

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      if (sortDir === 'desc') setSortDir('asc')
      else { setSortKey(null); setSortDir('desc') }
    } else {
      setSortKey(key); setSortDir('desc')
    }
    setShowSortMenu(false)
  }
  const [notionImporting, setNotionImporting] = useState(false)
  const [notionMsg, setNotionMsg] = useState<string | null>(null)
  const [notionSuccess, setNotionSuccess] = useState<boolean | null>(null) // null=숨김 true=성공 false=오류

  // 전체 태스크의 주간 오프셋 목록 (폴더 이동 메뉴용)
  const sortedOffsets = useMemo(() => {
    const offsets = new Set<number>()
    tasks.forEach(task => {
      const items = getSubtaskItems(task.description)
      if (items.length === 0) {
        offsets.add(task.is_done ? getWeekOffset(task.done_at) : getWeekOffset(task.created_at))
      } else {
        const createdOff = getWeekOffset(task.created_at)
        items.forEach(item => offsets.add(item.checked ? getWeekOffset(item.checkedAt) : createdOff))
      }
    })
    return Array.from(offsets).sort((a, b) => a - b)
  }, [tasks])

  // Escape 키로 선택 해제
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setSelectedIds(new Set()); setShowFolderMenu(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const { ref: borderRef, style: borderSmooth } = useSmoothCorners(30)
  const { ref: chatRef, style: chatSmooth } = useSmoothCorners(30)
  const [chatValue, setChatValue] = useState('')
  const characters = ['Bear','Cat','Chicken','Cow','Deer','Duck','Fox','Koala','Lion','Monkey','Mouse','Panda','Penguin','Pig','Rabbit','Raccoon','Sheep','Shiba Inu','Tiger','Weasel']
  const [selectedCharacter, setSelectedCharacter] = useState('Bear')
  const [showCharacterPicker, setShowCharacterPicker] = useState(false)
  const [charBtnHovered, setCharBtnHovered] = useState(false)
  const characterAreaRef = useRef<HTMLDivElement>(null)
  const folderMenuRef = useRef<HTMLDivElement>(null)

  // 팝업 외부 클릭 시 닫기 (캐릭터 피커 + 폴더 메뉴)
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (showCharacterPicker && characterAreaRef.current && !characterAreaRef.current.contains(e.target as Node)) {
        setShowCharacterPicker(false)
      }
      if (showFolderMenu && folderMenuRef.current && !folderMenuRef.current.contains(e.target as Node)) {
        setShowFolderMenu(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [showCharacterPicker, showFolderMenu])
  const dialogues = ['의욕이 없어도 일단 합시다!', '행동으로 의욕을 지배해요,\n주인이 누군지 보여줘요!', '속는 셈치고 딱 하나만 합시다!']
  const [dialogueIndex, setDialogueIndex] = useState(0)
  const isResizing = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  // 컨테이너 너비 관측 → personalRatio * containerWidth = personalWidth
  useLayoutEffect(() => {
    function updateWidth() {
      if (containerRef.current) setContainerWidth(containerRef.current.offsetWidth)
    }
    updateWidth()
    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [])

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing.current) return
    const containerW = containerRef.current?.offsetWidth ?? 800
    const delta = e.clientX - startX.current
    const newW = Math.max(160, Math.min(containerW * 0.75, startWidth.current + delta))
    setPersonalRatio(newW / containerW)
  }, [])

  const onMouseUp = useCallback(() => {
    isResizing.current = false
    setResizing(false)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    window.removeEventListener('mousemove', onMouseMove as EventListener)
    window.removeEventListener('mouseup', onMouseUp as EventListener)
  }, [onMouseMove])

  function onResizeStart(e: React.MouseEvent) {
    e.preventDefault()
    isResizing.current = true
    setResizing(true)
    startX.current = e.clientX
    startWidth.current = personalWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMouseMove as EventListener)
    window.addEventListener('mouseup', onMouseUp as EventListener)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  async function handleDeleteSelected() {
    const ids = [...selectedIds]
    setTasks(tasks.filter(t => !selectedIds.has(t.id)))
    setSelectedIds(new Set())
    await supabase.from('tasks').delete().in('id', ids)
  }

  async function handleMoveSelected(targetOffset: number) {
    const targetDate = getWeekStartDate(targetOffset)
    targetDate.setHours(12, 0, 0, 0)
    const targetISO = targetDate.toISOString()
    const updatedTasks = [...tasks]
    for (const taskId of selectedIds) {
      const idx = updatedTasks.findIndex(t => t.id === taskId)
      if (idx < 0) continue
      const task = updatedTasks[idx]
      const allItems = getSubtaskItems(task.description)
      if (allItems.length === 0) {
        updatedTasks[idx] = { ...task, done_at: targetISO, is_done: true }
        await supabase.from('tasks').update({ done_at: targetISO, is_done: true }).eq('id', taskId)
      } else {
        let desc = task.description
        allItems.forEach((item, i) => {
          if (item.checked) desc = setSubtaskCheckedAt(desc, i, targetISO) as object
        })
        updatedTasks[idx] = { ...task, description: desc as object, done_at: targetISO }
        await supabase.from('tasks').update({ description: desc, done_at: targetISO }).eq('id', taskId)
      }
    }
    setTasks(updatedTasks)
    setSelectedIds(new Set())
    setShowFolderMenu(false)
  }

  async function handleNotionImport() {
    setNotionImporting(true)
    setNotionMsg(null)
    setNotionSuccess(null)
    try {
      const res = await fetch('/api/notion-import', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        setNotionMsg(json.error ?? '가져오기 실패')
        setNotionSuccess(false)
      } else if (json.count === 0 && (json.updated?.length ?? 0) === 0) {
        setNotionMsg('새로 가져올 항목이 없습니다.')
        setNotionSuccess(true)
      } else {
        const parts = []
        if (json.count > 0) parts.push(`${json.count}개 추가`)
        if (json.updated?.length > 0) parts.push(`${json.updated.length}개 업데이트`)
        setNotionMsg(parts.join(' · ') + ' 완료')
        setNotionSuccess(true)
        const { data } = await supabase.from('tasks').select('*').order('created_at', { ascending: false })
        if (data) setTasks(data)
      }
    } catch {
      setNotionMsg('연결 오류가 발생했습니다.')
      setNotionSuccess(false)
    } finally {
      setNotionImporting(false)
      setTimeout(() => { setNotionMsg(null); setNotionSuccess(null) }, 4000)
    }
  }

  return (
    <div className="min-h-screen">
      {/* 좁은 중앙 영역 — 헤더 + 장식 요소 */}
      <div style={{ maxWidth: '820px', margin: '0 auto', padding: isMobile ? '0 16px' : '0 32px' }}>
        {/* 페이지 제목 — 검색/로그아웃만 */}
        <div className={`${isMobile ? 'pt-5' : 'pt-[38px]'} pb-5 flex items-center gap-4`}>
          <div className="flex-1" />

          {/* 로그아웃 — 오른쪽 정렬 */}
          <div className="flex items-center gap-4 flex-shrink-0" style={{ marginRight: 25 }}>
            <button
              onClick={handleSignOut}
              className="text-xs text-[#9b9a97] hover:text-[#37352f] transition-colors flex-shrink-0 cursor-pointer px-3 py-1.5 rounded-lg border border-[#e3e2e0] hover:bg-[#f7f6f3]"
            >
              로그아웃
            </button>
          </div>
        </div>

        {/* 콘텐츠 래퍼 — 페이드 테두리 기준점 */}
        <div style={{ position: 'relative', marginTop: '-10px' }}>
          {/* ✓ 할 일 제목 — 테두리 왼쪽 아래에 정렬 */}
          {/* 테두리 bottom = top(-320) + height(340) = 20px */}
          <h1
            className="text-3xl text-[#37352f]"
            style={{ position: 'absolute', left: 42, top: 105, zIndex: 2, pointerEvents: 'none', fontWeight: 700 }}
          >
            할 일
          </h1>

          {/* 페이드 테두리 — absolute로 섹션 너비에 정확히 맞춤 */}
          <div ref={borderRef} style={{
            position: 'absolute',
            top: -170,
            left: 0,
            right: 0,
            height: 340,
            border: '1px solid rgba(0,0,0,0.13)',
            borderRadius: 30,
            ...borderSmooth,
            pointerEvents: 'none',
            maskImage: 'linear-gradient(to bottom, transparent 0%, transparent 45%, black 80%)',
            WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, transparent 45%, black 80%)',
            zIndex: 0,
          }} />

          {/* 캐릭터 영역 — 모바일에서는 숨김 */}
          <div ref={characterAreaRef} style={{ position: 'absolute', top: -38, right: 32, zIndex: showCharacterPicker ? 35 : 15, display: isMobile ? 'none' : undefined }}>
            <div style={{ position: 'relative', width: 252, height: 252 }}>

              {/* 말풍선 — 캐릭터 바로 왼쪽 */}
              <div style={{ position: 'absolute', right: 'calc(100% - 5px)', top: 110, pointerEvents: 'none', width: 'max-content', maxWidth: 200 }}>
                <div style={{ position: 'relative' }}>
                  <div style={{
                    background: 'white', borderRadius: 14, padding: '10px 16px',
                    boxShadow: '0 2px 5px rgba(0,0,0,0.10)',
                    fontSize: 14, fontWeight: 600, color: '#37352f', lineHeight: 1.5, textAlign: 'center', whiteSpace: 'pre-line',
                  }}>
                    {dialogues[dialogueIndex]}
                  </div>
                  <div style={{
                    position: 'absolute', right: -9, top: '50%', transform: 'translateY(-50%)',
                    width: 0, height: 0,
                    borderTop: '8px solid transparent', borderBottom: '8px solid transparent', borderLeft: '9px solid white',
                  }} />
                </div>
              </div>

              {/* 캐릭터 이미지 — 클릭 시 대사 순환 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/fluffy character crop/${selectedCharacter} 1.png`}
                alt={selectedCharacter}
                onClick={() => setDialogueIndex(i => (i + 1) % dialogues.length)}
                style={{ width: 252, height: 252, objectFit: 'contain', mixBlendMode: 'multiply', cursor: 'pointer', display: 'block' }}
              />

              {/* 캐릭터 선택 버튼 */}
              <button
                onClick={() => setShowCharacterPicker(v => !v)}
                onMouseEnter={() => setCharBtnHovered(true)}
                onMouseLeave={() => setCharBtnHovered(false)}
                style={{
                  position: 'absolute', bottom: 38, right: 0,
                  width: 30, height: 30, borderRadius: '50%',
                  background: charBtnHovered ? '#f0efed' : 'white',
                  border: `1px solid ${charBtnHovered ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.10)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', padding: 0, overflow: 'hidden',
                  transition: 'background 0.12s, border-color 0.12s',
                }}
                title="캐릭터 변경"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/fluffy character crop/fluffy face/${selectedCharacter} 2.png`}
                  alt={selectedCharacter}
                  style={{ width: 24, height: 24, objectFit: 'contain', mixBlendMode: 'multiply' }}
                />
              </button>

              {/* 캐릭터 피커 */}
              <div style={{
                position: 'absolute', bottom: 74, right: 0,
                background: 'white', borderRadius: 14, border: '1px solid rgba(0,0,0,0.1)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.12)', padding: 8,
                display: showCharacterPicker ? 'grid' : 'none',
                gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, width: 220, zIndex: 50,
              }}>
                {characters.map(name => (
                  <button
                    key={name}
                    onClick={() => { setSelectedCharacter(name); setShowCharacterPicker(false) }}
                    title={name}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 4, borderRadius: 8, border: 'none', background: selectedCharacter === name ? '#f0efed' : 'transparent', cursor: 'pointer' }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/fluffy character crop/fluffy face/${name} 2.png`} alt={name} style={{ width: 32, height: 32, objectFit: 'contain', mixBlendMode: 'multiply' }} />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 채팅 입력창 */}
          <div ref={chatRef} style={{
            position: 'absolute',
            top: 178,
            left: 0,
            right: 0,
            backgroundColor: '#ffffff',
            borderRadius: 30,
            border: '1px solid rgba(0,0,0,0.09)',
            boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
            padding: '14px 18px 12px',
            zIndex: 20,
            ...chatSmooth,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                value={chatValue}
                onChange={e => setChatValue(e.target.value)}
                placeholder="오늘 할 일을 생각나는 대로 얘기해보세요."
                style={{ flex: 1, fontSize: 14, color: '#37352f', background: 'transparent', border: 'none', outline: 'none' }}
              />
              <button
                onClick={() => setChatValue('')}
                style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 999, background: chatValue ? '#37352f' : '#e3e2e0', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'background 0.15s' }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 2L12 7L7 12M2 7H12" stroke={chatValue ? 'white' : '#9b9a97'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          </div>

          {/* 채팅 요약창 — 텍스트 입력 시 표시 */}
          {chatValue.trim() && (
            <div style={{
              position: 'absolute',
              top: 240,
              left: 0,
              right: 0,
              backgroundColor: '#f7f6f3',
              borderRadius: 20,
              border: '1px solid rgba(0,0,0,0.07)',
              padding: '12px 18px',
              zIndex: 20,
            }}>
              <p style={{ fontSize: 12, color: '#9b9a97', marginBottom: 6, fontWeight: 500 }}>요약</p>
              <p style={{ fontSize: 14, color: '#37352f', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{chatValue}</p>
            </div>
          )}

          {/* 스페이서 */}
          <div style={{ height: 280 }} />
        </div>{/* 콘텐츠 래퍼 끝 */}
      </div>{/* 좁은 중앙 영역 끝 */}

      {/* 전체 너비 — 아이콘 행 + 태스크 섹션 */}
      <div className={isMobile ? 'px-3' : 'px-8'}>
        <div style={{ position: 'relative' }}>
          {/* 탭 바 — 모바일에서 가로 스크롤 가능 */}
          <div className="flex items-end border-b border-[#e3e2e0] mb-0 overflow-x-auto" style={{ gap: 0, scrollbarWidth: 'none' }}>
            {([
              { key: 'all', label: '전체', icon: <LayoutGrid size={14} /> },
              { key: 'personal', label: '개인', icon: <UserIcon size={14} /> },
              { key: 'work', label: '업무', icon: <img src="/work-icon.png" alt="업무" style={{ width: 14, height: 14, objectFit: 'contain', filter: 'brightness(0)', opacity: activeTab === 'work' ? 1 : 0.5 }} /> },
              { key: 'weekly', label: '위클리 미팅', icon: <Users size={14} /> },
              { key: 'meeting', label: '운영진 미팅', icon: <CalendarClock size={14} /> },
              { key: 'calendar', label: '구글 캘린더', icon: <CalendarDays size={14} /> },
            ] as const).map(tab => {
              const active = activeTab === tab.key
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 ${isMobile ? 'px-3 py-2' : 'px-4 py-2.5'} font-medium transition-colors cursor-pointer relative whitespace-nowrap`}
                  style={{
                    fontFamily: "'Toss Product Sans', 'Pretendard Variable', Pretendard, sans-serif",
                    fontSize: '12px',
                    color: active ? '#37352f' : '#9b9a97',
                    background: 'none',
                    border: 'none',
                    borderBottom: active ? '2px solid #37352f' : '2px solid transparent',
                    marginBottom: -1,
                  }}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              )
            })}
          </div>

          {/* 공유 아이콘 행 — 개인·업무 통합 (운영진 미팅 탭에서는 숨김) */}
          <div className="flex items-center border-b border-[#e3e2e0] py-1.5 gap-1 mb-2" style={{ display: activeTab === 'meeting' || activeTab === 'calendar' ? 'none' : 'flex' }}>
            {selectedIds.size > 0 ? (
              <div className="flex items-center gap-1.5 flex-1">
                <span className="text-xs font-semibold text-[#37352f] pl-1">{selectedIds.size}개 선택됨</span>
                <button onClick={() => setSelectedIds(new Set())} className="text-[#9b9a97] hover:text-[#37352f] transition-colors cursor-pointer">
                  <X size={12} />
                </button>
              </div>
            ) : <div className="flex-1" />}

            {/* 뷰 모드 토글 — 가장 왼쪽 */}
            <button
              onClick={() => setViewMode(v => v === 'card' ? 'table' : 'card')}
              className="flex items-center justify-center w-7 h-7 rounded-md cursor-pointer transition-colors"
              style={{ color: viewMode === 'table' ? '#37352f' : '#c1c0bd', background: viewMode === 'table' ? '#f0efed' : 'transparent' }}
              title={viewMode === 'card' ? '표 형식으로 보기' : '카드 형식으로 보기'}
            >
              {viewMode === 'card' ? <Table2 size={14} /> : <LayoutDashboard size={14} />}
            </button>

            {selectedIds.size > 0 && (
              <button onClick={handleDeleteSelected} className="flex items-center justify-center w-7 h-7 rounded-md text-red-400 hover:bg-red-50 transition-colors cursor-pointer" title="삭제">
                <Trash2 size={14} />
              </button>
            )}

            {/* 검색 버튼 */}
            {searchOpen ? (
              <div className="flex items-center gap-1.5 bg-[#f7f6f3] border border-[#e3e2e0] rounded-lg px-2 py-1 w-44">
                <Search size={12} className="text-[#9b9a97] flex-shrink-0" />
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') { setSearchOpen(false); setSearchQuery('') } }}
                  placeholder="할 일 검색..."
                  className="flex-1 text-xs text-[#37352f] placeholder:text-[#9b9a97] bg-transparent focus:outline-none"
                  autoFocus
                />
                {searchQuery && (
                  <button
                    onClick={() => { setSearchQuery(''); setSearchOpen(false) }}  // X → 검색어 + 바 모두 닫기
                    className="text-[#c1c0bd] hover:text-[#9b9a97] cursor-pointer"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            ) : (
              <button
                onClick={() => { setSearchOpen(true); setTimeout(() => searchInputRef.current?.focus(), 0) }}
                className="flex items-center justify-center w-7 h-7 rounded-md cursor-pointer transition-colors"
                style={{ color: '#c1c0bd' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#37352f')}
                onMouseLeave={e => (e.currentTarget.style.color = '#c1c0bd')}
                title="검색"
              >
                <Search size={14} />
              </button>
            )}

            <div className="relative" ref={folderMenuRef}>
              <button
                onClick={() => setShowFolderMenu(v => !v)}
                onMouseEnter={() => setFolderHovered(true)}
                onMouseLeave={() => setFolderHovered(false)}
                title="섹션으로 이동"
                className="flex items-center justify-center w-7 h-7 rounded-md cursor-pointer"
                style={{ color: selectedIds.size > 0 ? '#37352f' : folderHovered ? '#37352f' : '#c1c0bd', transition: 'color 0.15s' }}
              >
                <FolderInput size={15} />
              </button>
              {showFolderMenu && (
                <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-2xl shadow-xl border border-[#e3e2e0] z-50 overflow-hidden">
                  {([0, 1, 2, ...sortedOffsets.filter(o => o >= 3)] as number[])
                    .filter((o, i, arr) => arr.indexOf(o) === i)
                    .map(offset => (
                      <button key={offset} onClick={() => { handleMoveSelected(offset); setShowFolderMenu(false) }} className="w-full text-left px-4 py-2.5 hover:bg-[#f7f6f3] transition-colors cursor-pointer">
                        <div className="text-sm font-medium" style={{ color: offset === 0 ? '#CC6128' : offset === 1 ? '#7A32BA' : offset === 2 ? '#4F42C8' : '#646464' }}>
                          {offset === 0 ? '이번주' : offset === 1 ? '저번주' : offset === 2 ? '저저번주' : formatOldWeekTitle(offset)}
                        </div>
                        <div className="text-xs text-[#9b9a97] mt-0.5">{formatWeekRange(offset)}</div>
                      </button>
                    ))}
                </div>
              )}
            </div>

            {/* 정렬 버튼 — 전역 적용 */}
            <button
              ref={sortBtnRef}
              onClick={e => {
                e.stopPropagation()
                if (!showSortMenu) {
                  const rect = sortBtnRef.current!.getBoundingClientRect()
                  setSortMenuPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right })
                }
                setShowSortMenu(v => !v)
              }}
              className="flex items-center justify-center w-7 h-7 rounded-md cursor-pointer transition-colors"
              style={{ color: sortKey ? '#37352f' : '#c1c0bd', background: sortKey ? '#f0efed' : 'transparent' }}
              title="정렬"
            >
              {sortKey
                ? sortDir === 'desc' ? <ArrowDown size={14} /> : <ArrowUp size={14} />
                : <ArrowUpDown size={14} />}
            </button>

            {/* 정렬 드롭다운 */}
            {showSortMenu && sortMenuPos && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 9990 }} onClick={() => setShowSortMenu(false)} />
                <div
                  style={{
                    position: 'fixed', top: sortMenuPos.top, right: sortMenuPos.right,
                    background: '#fff', border: '1px solid #e3e2e0', borderRadius: 10,
                    boxShadow: '0 4px 20px rgba(0,0,0,0.12)', zIndex: 9991,
                    minWidth: 150, padding: '6px 0', overflow: 'hidden',
                  }}
                  onClick={e => e.stopPropagation()}
                >
                  {([
                    { key: 'created_at' as SortKey, label: '생성일' },
                    { key: 'title'      as SortKey, label: '제목 (가나다)' },
                    { key: 'done_at'    as SortKey, label: '완료일' },
                  ]).map(({ key, label }) => (
                    <button key={key} onClick={() => toggleSort(key)} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      width: '100%', padding: '7px 14px', border: 'none', cursor: 'pointer',
                      background: sortKey === key ? '#f7f6f3' : 'transparent',
                      color: sortKey === key ? '#37352f' : '#787774', fontSize: '13px', textAlign: 'left',
                    }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f7f6f3' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = sortKey === key ? '#f7f6f3' : 'transparent' }}
                    >
                      <span>{label}</span>
                      {sortKey === key && (sortDir === 'desc' ? <ArrowDown size={12} color="#37352f" /> : <ArrowUp size={12} color="#37352f" />)}
                    </button>
                  ))}
                  {sortKey && (
                    <>
                      <div style={{ height: 1, background: '#e3e2e0', margin: '4px 0' }} />
                      <button onClick={() => { setSortKey(null); setSortDir('desc'); setShowSortMenu(false) }} style={{
                        width: '100%', padding: '7px 14px', border: 'none', cursor: 'pointer',
                        background: 'transparent', color: '#9b9a97', fontSize: '13px', textAlign: 'left',
                      }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f7f6f3' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                      >정렬 해제</button>
                    </>
                  )}
                </div>
              </>
            )}

            <button
              onClick={handleNotionImport}
              disabled={notionImporting}
              title="노션에서 가져오기"
              onMouseEnter={() => setNotionHovered(true)}
              onMouseLeave={() => setNotionHovered(false)}
              className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-[#f0efed] transition-colors disabled:cursor-not-allowed cursor-pointer"
              style={{ position: 'relative' }}
            >
              {notionImporting ? (
                /* CSS 스피너 — 14px 크기, Notion 아이콘 자리에 표시 */
                <span style={{
                  display: 'inline-block', width: 14, height: 14, borderRadius: '50%',
                  border: '2px solid #d3d2d0', borderTopColor: '#37352f',
                  animation: 'spin 0.7s linear infinite',
                }} />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src="/notion-icon.png" alt="노션에서 가져오기" style={{ width: 14, height: 14, objectFit: 'contain', mixBlendMode: 'multiply', opacity: notionHovered ? 1 : 0.4, transition: 'opacity 0.25s ease' }} />
              )}
            </button>

          </div>

          {/* 노션 연동 상태 토스트 */}
          {(notionImporting || notionMsg) && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              margin: '0 4px 8px',
              padding: '8px 12px',
              borderRadius: 10,
              background: notionImporting ? '#f7f6f3'
                : notionSuccess ? '#f0faf4'
                : '#fff5f5',
              border: `1px solid ${notionImporting ? '#e3e2e0' : notionSuccess ? '#b7e4c7' : '#ffc9c9'}`,
              transition: 'all 0.2s',
            }}>
              {notionImporting ? (
                <>
                  <span style={{
                    display: 'inline-block', width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
                    border: '2px solid #d3d2d0', borderTopColor: '#787774',
                    animation: 'spin 0.7s linear infinite',
                  }} />
                  <span style={{ fontSize: '12px', color: '#787774' }}>노션 연동 중...</span>
                </>
              ) : notionSuccess ? (
                <>
                  <span style={{ fontSize: '14px', flexShrink: 0 }}>✓</span>
                  <span style={{ fontSize: '12px', color: '#2f9e5a' }}>{notionMsg}</span>
                </>
              ) : (
                <>
                  <span style={{ fontSize: '14px', flexShrink: 0 }}>✕</span>
                  <span style={{ fontSize: '12px', color: '#e03131' }}>{notionMsg}</span>
                </>
              )}
            </div>
          )}

          {/* 탭별 섹션 */}
          <div ref={containerRef} style={{ position: 'relative' }}>
            {activeTab === 'calendar' ? (
              <GoogleCalendarTab isMobile={isMobile} />
            ) : activeTab === 'meeting' ? (
              <MeetingTab isMobile={isMobile} />
            ) : activeTab === 'all' ? (
              <>
                {/* 데스크탑: 드래그로 너비 조절 가능한 2열 / 모바일: 세로 스택 */}
                {!isMobile && (
                  <div
                    onMouseDown={onResizeStart}
                    onMouseEnter={() => setHandleHovered(true)}
                    onMouseLeave={() => setHandleHovered(false)}
                    style={{ position: 'absolute', top: 0, bottom: 0, left: personalWidth, width: 16, cursor: 'col-resize', display: 'flex', justifyContent: 'center', zIndex: 1 }}
                  >
                    <div style={{ width: 0.5, alignSelf: 'stretch', backgroundColor: resizing ? 'rgba(59,130,246,0.4)' : handleHovered ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.07)', transition: 'background-color 0.15s' }} />
                  </div>
                )}
                <div className={isMobile ? 'flex flex-col' : 'flex items-start'}>
                  <div style={{ width: isMobile ? '100%' : personalWidth, flexShrink: 0, minWidth: 0 }}>
                    <TaskSection tasks={filteredTasks} setTasks={setTasks} userId={user.id} supabase={supabase} categoryFilter="personal" sortKey={sortKey} sortDir={sortDir} viewMode={viewMode} sharedSelectedIds={selectedIds} sharedSetSelectedIds={setSelectedIds} sharedLastSelectedId={lastSelectedId} sharedSetLastSelectedId={setLastSelectedId} />
                  </div>
                  {!isMobile && <div style={{ width: 16, flexShrink: 0 }} />}
                  <div className={isMobile ? 'w-full' : 'flex-1 min-w-0'}>
                    <TaskSection tasks={filteredTasks} setTasks={setTasks} userId={user.id} supabase={supabase} categoryFilter="work" sortKey={sortKey} sortDir={sortDir} viewMode={viewMode} sharedSelectedIds={selectedIds} sharedSetSelectedIds={setSelectedIds} sharedLastSelectedId={lastSelectedId} sharedSetLastSelectedId={setLastSelectedId} />
                  </div>
                </div>
              </>
            ) : activeTab === 'personal' ? (
              <TaskSection tasks={filteredTasks} setTasks={setTasks} userId={user.id} supabase={supabase} categoryFilter="personal" sortKey={sortKey} sortDir={sortDir} viewMode={viewMode} sharedSelectedIds={selectedIds} sharedSetSelectedIds={setSelectedIds} sharedLastSelectedId={lastSelectedId} sharedSetLastSelectedId={setLastSelectedId} />
            ) : activeTab === 'weekly' ? (
              <TaskSection tasks={filteredTasks} setTasks={setTasks} userId={user.id} supabase={supabase} categoryFilter="work" fixedOffset={1} sortKey={sortKey} sortDir={sortDir} viewMode={viewMode} sharedSelectedIds={selectedIds} sharedSetSelectedIds={setSelectedIds} sharedLastSelectedId={lastSelectedId} sharedSetLastSelectedId={setLastSelectedId} />
            ) : (
              <TaskSection tasks={filteredTasks} setTasks={setTasks} userId={user.id} supabase={supabase} categoryFilter="work" sortKey={sortKey} sortDir={sortDir} viewMode={viewMode} sharedSelectedIds={selectedIds} sharedSetSelectedIds={setSelectedIds} sharedLastSelectedId={lastSelectedId} sharedSetLastSelectedId={setLastSelectedId} />
            )}
          </div>
        </div>
        <div className="pb-16" />
      </div>{/* 전체 너비 끝 */}
    </div>
  )
}
