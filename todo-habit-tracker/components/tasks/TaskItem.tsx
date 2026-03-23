'use client'

import { useState, useRef, useLayoutEffect, Fragment, CSSProperties, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useSmoothCorners } from '@/hooks/useSmoothCorners'
import { Task } from '@/types'
import { getSubtaskItems } from '@/lib/taskItems'
import { CheckSquare, CheckCircle, PanelRight } from 'lucide-react'
import dynamic from 'next/dynamic'

// emoji-mart lazy load — 초기 번들에 포함 안 됨
const EmojiPicker = dynamic(() => import('@emoji-mart/react'), { ssr: false })

// ── 스페이스바 상태 추적 (모듈 레벨 싱글턴) ──────────────────
// 컴포넌트가 여러 개 렌더링돼도 리스너는 단 한 번만 등록됨
let spaceHeld = false
if (typeof window !== 'undefined') {
  document.addEventListener('keydown', (e) => {
    if (
      e.key === ' ' &&
      !(e.target instanceof HTMLInputElement) &&
      !(e.target instanceof HTMLTextAreaElement) &&
      !(e.target as HTMLElement).isContentEditable
    ) {
      spaceHeld = true
      e.preventDefault() // 페이지 스크롤 방지
    }
  }, { capture: true }) // capture: true → 브라우저 스크롤 처리 전에 가로챔
  document.addEventListener('keyup', (e) => {
    if (e.key === ' ') spaceHeld = false
  })
}
// ──────────────────────────────────────────────────────────────

interface Props {
  task: Task
  onToggle: (noDate?: boolean) => void
  onDelete: () => void
  onClick: () => void
  onRename: (title: string) => void
  onSubtaskToggle: (index: number, noDate?: boolean) => void
  onSubtaskRename: (index: number, text: string) => void
  onSubtaskAdd: (afterOrigIdx: number, text: string) => void
  onSubtaskDelete: (index: number) => void
  onSubtaskDateChange: (index: number, checkedAt: string | null) => void
  cardBorderColor?: string
  visibleOrigIndices?: Set<number>
  selected?: boolean
  selectionActive?: boolean
  onSelect?: (shiftKey: boolean) => void
  onNoteChange?: (note: string) => void
  onFirstSubtaskCreate?: (text: string) => void
  onCreatedAtChange?: (iso: string) => void
  availableTags?: string[]
  onTagChange?: (tag: string | null) => void
  onNoDeadlineToggle?: () => void
  onMemoryToggle?: () => void
  onIconChange?: (icon: string | null) => void
}

const MAX_VISIBLE = 100

function formatCreatedAt(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}.${d.getDate()}`
}

export default function TaskItem({ task, onToggle, onDelete, onClick, onRename, onSubtaskToggle, onSubtaskRename, onSubtaskAdd, onSubtaskDelete, onSubtaskDateChange, cardBorderColor, visibleOrigIndices, selected, selectionActive, onSelect, onNoteChange, onFirstSubtaskCreate, onCreatedAtChange, availableTags, onTagChange, onNoDeadlineToggle, onMemoryToggle, onIconChange }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(task.title)
  const [editingSubtaskIdx, setEditingSubtaskIdx] = useState<number | null>(null)
  const [subtaskDraft, setSubtaskDraft] = useState('')
  const [pendingAfterOrigIdx, setPendingAfterOrigIdx] = useState<number | null>(null)
  const [pendingDraft, setPendingDraft] = useState('')
  const [editingDateIdx, setEditingDateIdx] = useState<number | null>(null)
  const [dateDraft, setDateDraft] = useState('')
  const [noteDraft, setNoteDraft] = useState(task.note ?? '')
  const [addingFirstSubtask, setAddingFirstSubtask] = useState(false)
  const [firstSubtaskDraft, setFirstSubtaskDraft] = useState('')
  const [editingCreatedAt, setEditingCreatedAt] = useState(false)
  const [createdAtDraft, setCreatedAtDraft] = useState('')
  const [noteActive, setNoteActive] = useState(false)
  const [editingTag, setEditingTag] = useState(false)
  const [showIconPicker, setShowIconPicker] = useState(false)
  const [iconPickerPos, setIconPickerPos] = useState<{ top: number; left: number } | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [emojiData, setEmojiData] = useState<any>(null)
  const iconBtnRef = useRef<HTMLButtonElement>(null)

  // emoji-mart 데이터 lazy load
  useEffect(() => {
    if (showIconPicker && !emojiData) {
      import('@emoji-mart/data').then(mod => setEmojiData(mod.default))
    }
  }, [showIconPicker, emojiData])
  const [tagDraft, setTagDraft] = useState(task.tag ?? '')
  const [showTagDropdown, setShowTagDropdown] = useState(false)
  const [addingOption, setAddingOption] = useState(false)
  const [newOptionDraft, setNewOptionDraft] = useState('')
  const [colorPickingTag, setColorPickingTag] = useState<string | null>(null)
  const [tagColors, setTagColors] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('tagColors') ?? '{}') } catch { return {} }
  })
  const tagDropdownRef = useRef<HTMLDivElement>(null)
  const tagBtnRef = useRef<HTMLButtonElement>(null)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; right: number } | null>(null)

  // 드롭다운 열릴 때 버튼 위치 계산
  useEffect(() => {
    if (showTagDropdown && tagBtnRef.current) {
      const r = tagBtnRef.current.getBoundingClientRect()
      // 문서 좌표계로 저장 (position: absolute + scrollOffset)
      setDropdownPos({ top: r.bottom + window.scrollY + 4, right: window.scrollX + window.innerWidth - r.right })
    }
  }, [showTagDropdown])

  const TAG_PALETTE = ['#e07a5f','#f2cc8f','#81b29a','#3d405b','#6d6875','#5c9ead','#e9c46a','#f4a261','#264653','#a8dadc']

  function setTagColor(tag: string, color: string) {
    const next = { ...tagColors, [tag]: color }
    setTagColors(next)
    localStorage.setItem('tagColors', JSON.stringify(next))
  }
  const inputRef = useRef<HTMLInputElement>(null)
  const subtaskListRef = useRef<HTMLDivElement>(null)
  const [overflowCount, setOverflowCount] = useState(0)
  const { ref: cardRef, style: squircleStyle } = useSmoothCorners(18)

  const allItems = getSubtaskItems(task.description)
  const total = allItems.length
  const checkedCount = allItems.filter(i => i.checked).length
  const progress = total > 0 ? Math.round((checkedCount / total) * 100) : 0
  const allDone = total > 0 && checkedCount === total

  // 세부항목 높이 넘침 감지 → 하단에 +N개 더 표시
  useLayoutEffect(() => {
    const el = subtaskListRef.current
    if (!el) { setOverflowCount(0); return }
    if (el.scrollHeight <= el.clientHeight + 2) { setOverflowCount(0); return }
    const ROW_H = 32
    const visibleApprox = Math.max(1, Math.floor(el.clientHeight / ROW_H))
    const uncheckedTotal = allItems.filter(i => !i.checked).length
    setOverflowCount(Math.max(0, uncheckedTotal - visibleApprox))
  }, [total])

  const allItemsWithIdx = allItems.map((item, origIdx) => ({ ...item, origIdx }))

  // 섹션 필터 적용: visibleOrigIndices가 있으면 해당 항목만, 카드에서는 미체크 항목만 표시
  const itemPool = (visibleOrigIndices
    ? allItemsWithIdx.filter(item => visibleOrigIndices.has(item.origIdx))
    : allItemsWithIdx
  ).filter(item => !item.checked)

  // 번호 박스용: depth별 계층 번호 (1, 1-1, 1-2, 2, 2-1 …)
  // 캔버스와 번호가 일치하려면 전체 항목(체크된 것 포함) 기준으로 번호를 부여해야 함
  const itemNumberMap = (() => {
    const result = new Map<number, string>()
    const counters: number[] = []
    for (const item of allItemsWithIdx) {
      const d = item.depth
      while (counters.length <= d) counters.push(0)
      counters[d]++
      for (let i = d + 1; i < counters.length; i++) counters[i] = 0
      result.set(item.origIdx, counters.slice(0, d + 1).join('-'))
    }
    return result
  })()

  let display: typeof itemPool
  let remaining: number
  if (itemPool.length <= MAX_VISIBLE) {
    display = itemPool
    remaining = 0
  } else {
    // 먼저 미완료 세부항목(depth > 0)을 찾는다
    const firstUncheckedSubIdx = itemPool.findIndex(item => !item.checked && item.depth > 0)

    if (firstUncheckedSubIdx > 0) {
      // 미완료 세부항목 발견 → 그 부모 + 바로 아래에 미완료 세부항목 + 이후 순서대로
      const depth = itemPool[firstUncheckedSubIdx].depth
      let parentFlatIdx = 0
      for (let i = firstUncheckedSubIdx - 1; i >= 0; i--) {
        if (itemPool[i].depth < depth) { parentFlatIdx = i; break }
      }
      const fromUnchecked = itemPool.slice(firstUncheckedSubIdx, firstUncheckedSubIdx + MAX_VISIBLE - 1)
      display = [itemPool[parentFlatIdx], ...fromUnchecked]
      remaining = Math.max(0, itemPool.length - firstUncheckedSubIdx - (MAX_VISIBLE - 1))
    } else {
      // 미완료 세부항목 없음 → 첫 번째 미완료 최상위 항목부터
      const firstUncheckedIdx = itemPool.findIndex(item => !item.checked)
      const startIdx = firstUncheckedIdx <= 0 ? 0 : firstUncheckedIdx
      display = itemPool.slice(startIdx, startIdx + MAX_VISIBLE)
      remaining = Math.max(0, itemPool.length - startIdx - MAX_VISIBLE)
    }
  }

  function startEdit(e?: React.MouseEvent) {
    e?.stopPropagation()
    setDraft(task.title)
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  function commitEdit() {
    const title = draft.trim()
    if (title && title !== task.title) onRename(title)
    setEditing(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') commitEdit()
    if (e.key === 'Escape') setEditing(false)
  }

  function startSubtaskEdit(e: React.MouseEvent, origIdx: number, text: string) {
    e.stopPropagation()
    setEditingSubtaskIdx(origIdx)
    setSubtaskDraft(text)
  }

  function commitSubtaskEdit() {
    if (editingSubtaskIdx !== null && subtaskDraft.trim()) {
      onSubtaskRename(editingSubtaskIdx, subtaskDraft.trim())
    }
    setEditingSubtaskIdx(null)
  }

  function handleSubtaskKeyDown(e: React.KeyboardEvent) {
    e.stopPropagation()
    if (e.key === 'Enter') {
      const afterIdx = editingSubtaskIdx
      commitSubtaskEdit()
      setPendingAfterOrigIdx(afterIdx)
      setPendingDraft('')
    } else if ((e.key === 'Backspace' || e.key === 'Delete') && subtaskDraft === '' && editingSubtaskIdx !== null) {
      e.preventDefault()
      const idx = editingSubtaskIdx
      setEditingSubtaskIdx(null)
      setSubtaskDraft('')
      onSubtaskDelete(idx)
    } else if (e.key === 'Escape') {
      setEditingSubtaskIdx(null)
    }
  }

  function commitPending() {
    const text = pendingDraft.trim()
    const afterIdx = pendingAfterOrigIdx
    setPendingAfterOrigIdx(null)
    setPendingDraft('')
    if (text && afterIdx !== null) onSubtaskAdd(afterIdx, text)
  }

  function handlePendingKeyDown(e: React.KeyboardEvent) {
    e.stopPropagation()
    if (e.key === 'Enter') {
      commitPending()
    } else if ((e.key === 'Backspace' || e.key === 'Delete') && pendingDraft === '') {
      e.preventDefault()
      setPendingAfterOrigIdx(null)
      setPendingDraft('')
    } else if (e.key === 'Escape') {
      setPendingAfterOrigIdx(null)
      setPendingDraft('')
    }
  }

  function startDateEdit(e: React.MouseEvent, origIdx: number, checkedAt: string) {
    e.stopPropagation()
    const d = new Date(checkedAt)
    setDateDraft(`${d.getMonth() + 1}.${d.getDate()}`)
    setEditingDateIdx(origIdx)
  }

  function commitDateEdit() {
    if (editingDateIdx === null) return
    const match = dateDraft.trim().match(/^(\d{1,2})\.(\d{1,2})$/)
    if (match) {
      const m = parseInt(match[1], 10)
      const d = parseInt(match[2], 10)
      const year = new Date().getFullYear()
      const iso = new Date(year, m - 1, d).toISOString()
      onSubtaskDateChange(editingDateIdx, iso)
    }
    setEditingDateIdx(null)
  }

  function handleDateKeyDown(e: React.KeyboardEvent) {
    e.stopPropagation()
    if (e.key === 'Enter') commitDateEdit()
    else if (e.key === 'Escape') setEditingDateIdx(null)
  }


  return (
    // Layer 1: drop-shadow 래퍼 — clip-path 없이 squircle 모양 그림자
    <div style={{
      filter: [
        'drop-shadow(0 4px 4px rgba(0,0,0,0.02))',
        'drop-shadow(0 1px 1px rgba(0,0,0,0.02))',
      ].join(' '),
    }}>
    {/* Layer 2: squircle 테두리 — clip-path + bg=테두리색 + padding=테두리두께 */}
    <div
      ref={cardRef}
      style={{
        borderRadius: 18,
        padding: '1px',
        backgroundColor: 'rgba(0,0,0,0.035)',
        ...(squircleStyle as CSSProperties),
      }}
    >
    {/* Layer 3: 카드 콘텐츠 */}
    <div
      className={`group relative p-4 cursor-pointer transition-all flex flex-col gap-1 ${task.is_done ? 'opacity-60' : ''}`}
      style={{
        backgroundColor: selected ? '#EEF4FF' : '#FDFDFD',
        borderRadius: 17,
        cursor: 'pointer',
        paddingBottom: '9px',
      }}
      onClick={e => onSelect?.(e.shiftKey)}
    >
      {/* 헤더 — 완료토글 + 제목 + 태그드롭다운 */}
      <div className="flex items-start gap-2.5">
        {/* 큰 버튼: 클릭=이모지 피커, Space+클릭=완료/해제 토글 */}
        <div className="relative flex-shrink-0 mt-0.5">
          <button
            ref={iconBtnRef}
            onClick={e => {
              e.stopPropagation()
              if (spaceHeld) {
                // 스페이스+클릭 → 완료/해제 토글 (done 여부 무관하게 항상 반전)
                onToggle(false)
              } else {
                // 일반 클릭 → 이모지 피커 (완료 여부 무관)
                const rect = iconBtnRef.current!.getBoundingClientRect()
                // 문서 좌표계(scrollX/Y 포함)로 저장 → position:absolute에서 스크롤과 함께 이동
                const docLeft = rect.left + window.scrollX
                const docTop  = rect.bottom + window.scrollY + 8
                const maxLeft = window.scrollX + window.innerWidth - 360
                setIconPickerPos({ top: docTop, left: Math.max(0, Math.min(docLeft, maxLeft)) })
                setShowIconPicker(v => !v)
              }
            }}
            className={`w-8 h-8 border flex items-center justify-center transition-colors cursor-pointer ${
              task.is_done
                ? 'border-[#37352f] bg-[#37352f]'
                : 'border-[#e3e2e0] bg-[#f7f6f3] hover:border-[#9b9a97]'
            }`}
            style={{ borderRadius: 6, position: 'relative', overflow: 'hidden' }}
            title={task.is_done ? 'Space+클릭으로 완료 해제' : 'Space+클릭으로 완료 · 클릭으로 이모지 선택'}
          >
            {task.icon ? (
              /* 이모지 설정된 경우: 이모지 크게 + 완료 시 반투명 체크 오버레이 */
              <>
                <span style={{ fontSize: 20, lineHeight: 1, userSelect: 'none' }}>{task.icon}</span>
                {task.is_done && (
                  <span style={{
                    position: 'absolute', inset: 0, background: 'rgba(55,53,47,0.65)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 5,
                  }}>
                    <svg width="12" height="10" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </span>
                )}
              </>
            ) : task.is_done ? (
              /* 이모지 없음 + 완료: 기존 체크마크 */
              <svg width="12" height="10" viewBox="0 0 10 8" fill="none">
                <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              /* 기본: CheckSquare */
              <CheckSquare size={14} className="text-[#9b9a97]" />
            )}
          </button>
        </div>

        {/* 이모지 피커 팝오버 (emoji-mart) */}
        {showIconPicker && iconPickerPos && createPortal(
          <>
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
              onMouseDown={() => setShowIconPicker(false)}
            />
            <div
              onMouseDown={e => e.stopPropagation()}
              style={{ position: 'absolute', top: iconPickerPos.top, left: iconPickerPos.left, zIndex: 9999 }}
            >
              <EmojiPicker
                data={emojiData}
                locale="ko"
                onEmojiSelect={(emoji: { native: string }) => {
                  onIconChange?.(emoji.native)
                  setShowIconPicker(false)
                }}
                onClickOutside={() => setShowIconPicker(false)}
                previewPosition="none"
                skinTonePosition="none"
                theme="light"
                icons="auto"
              />
              {/* 이모지 제거 버튼 */}
              {task.icon && (
                <button
                  onMouseDown={e => e.stopPropagation()}
                  onClick={() => { onIconChange?.(null); setShowIconPicker(false) }}
                  style={{
                    width: '100%', padding: '8px 0', border: 'none', borderTop: '1px solid #e3e2e0',
                    background: '#fff', color: '#9b9a97', fontSize: 13, cursor: 'pointer',
                    borderRadius: '0 0 12px 12px',
                  }}
                >아이콘 제거</button>
              )}
            </div>
          </>,
          document.body
        )}

        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              ref={inputRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={handleKeyDown}
              onClick={e => e.stopPropagation()}
              className="w-full text-base font-bold text-[#37352f] bg-transparent border-b border-[#37352f] focus:outline-none cursor-text"
              autoFocus
            />
          ) : (
            <>
              <div className="group/title relative">
                <h3
                  className={`text-base font-bold leading-tight cursor-pointer ${task.is_done ? 'text-[#9b9a97]' : 'text-[#37352f]'}`}
                  onClick={e => { e.stopPropagation(); onClick() }}
                  onDoubleClick={e => { e.stopPropagation(); startEdit() }}
                >
                  {task.title}
                </h3>
                {/* 호버 시 열기 버튼 — 제목 위에 절대 배치 */}
                <div className="opacity-0 group-hover/title:opacity-100 transition-opacity absolute inset-0 flex items-center justify-end pointer-events-none">
                  <button
                    onClick={e => { e.stopPropagation(); onClick() }}
                    className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[#9b9a97] hover:text-[#37352f] hover:bg-[#f0efed] transition-colors cursor-pointer pointer-events-auto"
                    title="열기"
                  >
                    <PanelRight size={11} />
                    <span style={{ fontSize: '10px', fontWeight: 500 }}>열기</span>
                  </button>
                </div>
              </div>
              {!task.is_done && ((noteActive || noteDraft) ? (
                <input
                  value={noteDraft}
                  autoFocus={noteActive && !noteDraft}
                  onChange={e => setNoteDraft(e.target.value)}
                  onFocus={() => setNoteActive(true)}
                  onBlur={() => { setNoteActive(false); onNoteChange?.(noteDraft) }}
                  onClick={e => e.stopPropagation()}
                  placeholder="설명 추가..."
                  className="w-full text-xs text-[#9b9a97] placeholder:text-[#c1c0bd] bg-transparent focus:outline-none mt-0 min-w-0"
                />
              ) : (
                <div
                  className="invisible group-hover:visible mt-0 cursor-text text-xs text-[#c1c0bd]"
                  onClick={e => { e.stopPropagation(); setNoteActive(true) }}
                >
                  설명 추가...
                </div>
              ))}
            </>
          )}
        </div>

        {/* 태그 드롭다운 — 헤더 오른쪽 */}
        <div ref={tagDropdownRef} className="relative flex-shrink-0" onClick={e => e.stopPropagation()} style={{ overflow: 'visible', marginTop: '-5px' }}
          onBlur={e => { if (!tagDropdownRef.current?.contains(e.relatedTarget as Node)) { setShowTagDropdown(false); setAddingOption(false); setNewOptionDraft(''); setColorPickingTag(null) } }}
        >
          <button
            ref={tagBtnRef}
            onClick={e => { e.stopPropagation(); setShowTagDropdown(v => !v); setAddingOption(false); setNewOptionDraft(''); setColorPickingTag(null) }}
            style={{
              fontSize: '10px', padding: '2px 6px', borderRadius: 4, cursor: 'pointer', border: 'none',
              background: task.tag ? (tagColors[task.tag] ? tagColors[task.tag] + '22' : '#f0efed') : 'transparent',
              color: task.tag ? (tagColors[task.tag] ?? '#787774') : '#c1c0bd',
              whiteSpace: 'nowrap',
            }}
            className={task.tag ? '' : 'invisible group-hover:visible'}
          >
            {task.tag ?? '+ 유형'}
          </button>

          {showTagDropdown && dropdownPos && createPortal(
            <>
              {/* 투명 백드롭 — 드롭다운 바깥 클릭 시 닫기 */}
              <div
                onMouseDown={() => { setShowTagDropdown(false); setAddingOption(false); setColorPickingTag(null) }}
                style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
              />
            <div
              onMouseDown={e => e.stopPropagation()}
              style={{
                position: 'absolute', top: dropdownPos.top, right: dropdownPos.right,
                background: 'white', border: '1px solid #e3e2e0', borderRadius: 6,
                boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 9999, minWidth: 110, padding: '4px 0',
              }}>
              {/* 기존 옵션 목록 */}
              {(availableTags ?? []).map(t => (
                <div key={t}>
                  <div
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '4px 10px', cursor: 'pointer',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f7f6f3')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    {/* 색상 점 — 클릭 시 팔레트 토글 */}
                    <span
                      onMouseDown={e => { e.preventDefault(); e.stopPropagation(); setColorPickingTag(colorPickingTag === t ? null : t) }}
                      style={{
                        width: 10, height: 10, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
                        background: tagColors[t] ?? (task.tag === t ? '#37352f' : '#e3e2e0'),
                        border: colorPickingTag === t ? '2px solid #37352f' : '2px solid transparent',
                        boxSizing: 'border-box',
                      }}
                    />
                    {/* 태그 이름 — 클릭 시 선택 */}
                    <span
                      onMouseDown={e => { e.preventDefault(); onTagChange?.(task.tag === t ? null : t); setShowTagDropdown(false); setColorPickingTag(null) }}
                      style={{ fontSize: '11px', color: '#37352f', flex: 1 }}
                    >{t}</span>
                  </div>
                  {/* 색상 팔레트 */}
                  {colorPickingTag === t && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '4px 10px 6px' }}>
                      {TAG_PALETTE.map(c => (
                        <span
                          key={c}
                          onMouseDown={e => { e.preventDefault(); setTagColor(t, c); setColorPickingTag(null) }}
                          style={{
                            width: 14, height: 14, borderRadius: '50%', background: c, cursor: 'pointer',
                            border: tagColors[t] === c ? '2px solid #37352f' : '2px solid transparent',
                            boxSizing: 'border-box',
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {/* 구분선 */}
              {(availableTags ?? []).length > 0 && (
                <div style={{ height: 1, background: '#f0efed', margin: '4px 0' }} />
              )}

              {/* 옵션 추가 */}
              {addingOption ? (
                <div style={{ padding: '4px 12px' }}>
                  <input
                    value={newOptionDraft}
                    onChange={e => setNewOptionDraft(e.target.value)}
                    onKeyDown={e => {
                      e.stopPropagation()
                      if (e.key === 'Enter') {
                        const v = newOptionDraft.trim()
                        if (v) { onTagChange?.(v); setShowTagDropdown(false) }
                        setAddingOption(false); setNewOptionDraft('')
                      } else if (e.key === 'Escape') {
                        setAddingOption(false); setNewOptionDraft('')
                      }
                    }}
                    onBlur={() => { setAddingOption(false); setNewOptionDraft('') }}
                    placeholder="옵션 이름..."
                    autoFocus
                    style={{ width: '100%', fontSize: '11px', color: '#37352f', background: 'transparent', border: 'none', borderBottom: '1px solid #c1c0bd', outline: 'none' }}
                  />
                </div>
              ) : (
                <button
                  onMouseDown={e => { e.preventDefault(); setAddingOption(true) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left', padding: '5px 12px', fontSize: '11px', color: '#9b9a97', background: 'none', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f7f6f3')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  + 옵션 추가
                </button>
              )}
            </div>
            </>,
            document.body
          )}
        </div>

      </div>

      {/* 진행도 + 트리 — 완료된 항목은 숨김 */}
      {total > 0 && !task.is_done && (
        <div className="ml-0">

          {/* 진행도 pill — 왼쪽 정렬, 가지선 없음 */}
          <div className="pt-0 pb-0">
            <div className="inline-flex items-center gap-2 bg-[#f7f6f3] border border-[#e3e2e0] rounded-full px-3 py-1.5">
              <CheckCircle size={12} className={allDone ? 'text-green-500' : 'text-[#c1c0bd]'} />
              <span className="text-xs text-[#787774] font-semibold whitespace-nowrap">
                {checkedCount} of {total}
              </span>
              <div className="w-16 h-1.5 bg-[#e3e2e0] rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-xs font-bold text-[#37352f] w-7 text-right">{progress}%</span>
            </div>
          </div>

          {/* 세부 항목 — border-l이 pill 바로 아래서 시작 */}
          <div style={{ marginLeft: '10px' }}>
          <div ref={subtaskListRef} style={{ maxHeight: '10rem', overflow: 'hidden' }}>
          {display.map((item, displayIdx) => {
            const INDENT = 16, BOX_HALF = 7, BASE_LEFT = 20
            const pl = BASE_LEFT + item.depth * INDENT
            const hasPendingAfter = pendingAfterOrigIdx === item.origIdx
            // 같은 depth의 다음 형제가 있는지 (하위 항목 건너뜀)
            const isLastSib = (() => {
              for (let j = displayIdx + 1; j < display.length; j++) {
                if (display[j].depth < item.depth) return true
                if (display[j].depth === item.depth) return false
              }
              return remaining === 0 && !hasPendingAfter
            })()
            // 바로 아래 항목이 자식인지 (아래로 내려가는 stub 필요)
            const hasChildBelow = displayIdx + 1 < display.length && display[displayIdx + 1].depth > item.depth
            // 조상 레벨 중 아직 형제가 남은 depth 목록 (연속선 필요)
            const ancContinuations: number[] = []
            for (let a = 0; a < item.depth - 1; a++) {
              for (let j = displayIdx + 1; j < display.length; j++) {
                if (display[j].depth <= a) break
                if (display[j].depth === a + 1) { ancContinuations.push(a); break }
              }
            }
            return (
              <Fragment key={item.origIdx}>
                <div
                  className="relative flex items-center gap-2 py-1.5 cursor-default"
                  style={{ paddingLeft: `${pl}px` }}
                  onClick={e => e.stopPropagation()}
                >
                  {/* 조상 연속선 — 조상이 아직 형제를 가진 경우 */}
                  {ancContinuations.map(a => (
                    <div key={a} className="absolute w-px bg-[#e3e2e0]" style={{ left: BASE_LEFT + a * INDENT + BOX_HALF, top: 0, height: '100%', zIndex: 0 }} />
                  ))}
                  {/* 세로선 — depth=0: 게이지에서 나온 트리가지 / depth>0: 부모 박스 중심에서 연결 */}
                  {item.depth === 0 ? (
                    <>
                      <div className="absolute w-px bg-[#e3e2e0]" style={{ left: 0, top: 0, height: isLastSib ? '50%' : '100%', zIndex: 0 }} />
                      <div className="absolute top-1/2 -translate-y-1/2 h-px bg-[#e3e2e0]" style={{ left: 0, width: 14, zIndex: 0 }} />
                    </>
                  ) : (
                    <div
                      className="absolute w-px bg-[#e3e2e0]"
                      style={{ left: BASE_LEFT + (item.depth - 1) * INDENT + BOX_HALF, top: 0, height: isLastSib ? '50%' : '100%', zIndex: 0 }}
                    />
                  )}
                  {/* 아래로 내려가는 stub — 자식 항목이 있을 때 */}
                  {hasChildBelow && (
                    <div className="absolute w-px bg-[#e3e2e0]" style={{ left: BASE_LEFT + item.depth * INDENT + BOX_HALF, top: '50%', bottom: 0, zIndex: 0 }} />
                  )}
                  {/* 가로 분기선 — depth>0: 부모 중심에서 자식 박스까지 */}
                  {item.depth > 0 && (
                    <div
                      className="absolute top-1/2 -translate-y-1/2 h-px bg-[#e3e2e0]"
                      style={{ left: BASE_LEFT + (item.depth - 1) * INDENT + BOX_HALF, width: INDENT - BOX_HALF, zIndex: 0 }}
                    />
                  )}
                  {/* 번호 박스 — 누르면 색이 채워짐 */}
                  {(() => {
                    const label = itemNumberMap.get(item.origIdx) ?? ''
                    const single = label.length === 1
                    return (
                      <button
                        onClick={e => { e.stopPropagation(); onSubtaskToggle(item.origIdx, e.ctrlKey || e.metaKey) }}
                        className={`${single ? 'w-3.5 h-3.5' : 'h-3.5 px-1'} border flex-shrink-0 flex items-center justify-center transition-colors cursor-pointer font-light leading-none select-none ${
                          item.checked
                            ? 'border-[#9b9a97] bg-[#9b9a97] text-white'
                            : 'border-[#c1c0bd] bg-[#fdfdfd] text-[#c1c0bd] hover:border-[#9b9a97] hover:text-[#9b9a97]'
                        }`}
                        style={{ position: 'relative', zIndex: 1 }}
                      >
                        <span style={{ fontSize: '9px', fontWeight: 500, lineHeight: 1, whiteSpace: 'nowrap' }}>
                          {label}
                        </span>
                      </button>
                    )
                  })()}

                  {/* 텍스트 — "I" 커서, 클릭 시 편집 */}
                  {editingSubtaskIdx === item.origIdx ? (
                    <input
                      value={subtaskDraft}
                      onChange={e => setSubtaskDraft(e.target.value)}
                      onBlur={commitSubtaskEdit}
                      onKeyDown={handleSubtaskKeyDown}
                      onClick={e => e.stopPropagation()}
                      className="flex-1 min-w-0 text-sm text-[#37352f] bg-transparent border-b border-[#37352f] focus:outline-none cursor-text"
                      autoFocus
                    />
                  ) : (
                    <span
                      className={`flex-1 text-sm font-medium leading-snug cursor-text select-text ${item.checked ? 'text-[#9b9a97]' : 'text-[#37352f]'}`}
                      onClick={e => startSubtaskEdit(e, item.origIdx, item.text)}
                    >
                      {item.text}
                      {item.checked && item.checkedAt && (
                        editingDateIdx === item.origIdx ? (
                          <input
                            value={dateDraft}
                            onChange={e => setDateDraft(e.target.value)}
                            onBlur={commitDateEdit}
                            onKeyDown={handleDateKeyDown}
                            onClick={e => e.stopPropagation()}
                            className="ml-1 w-9 text-xs text-[#37352f] bg-transparent border-b border-[#9b9a97] focus:outline-none cursor-text"
                            autoFocus
                          />
                        ) : (
                          <span
                            className="ml-1 not-italic no-underline cursor-pointer"
                            style={{ textDecoration: 'none' }}
                            onClick={e => startDateEdit(e, item.origIdx, item.checkedAt!)}
                          >
                            <span className="text-xs text-[#b8b7b4] hover:text-[#9b9a97]">
                              ({new Date(item.checkedAt).getMonth() + 1}.{new Date(item.checkedAt).getDate()})
                            </span>
                          </span>
                        )
                      )}
                    </span>
                  )}
                </div>

                {/* 엔터로 추가된 대기 입력 — 항상 마지막이므로 ㄴ 모양 */}
                {hasPendingAfter && (
                  <div
                    className="relative flex items-center gap-2 py-1.5"
                    style={{ paddingLeft: `${pl}px` }}
                    onClick={e => e.stopPropagation()}
                  >
                    {item.depth === 0 ? (
                      <>
                        <div className="absolute w-px bg-[#e3e2e0]" style={{ left: 0, top: 0, height: '50%', zIndex: 0 }} />
                        <div className="absolute top-1/2 -translate-y-1/2 h-px bg-[#e3e2e0]" style={{ left: 0, width: 14, zIndex: 0 }} />
                      </>
                    ) : (
                      <>
                        <div className="absolute w-px bg-[#e3e2e0]" style={{ left: BASE_LEFT + (item.depth - 1) * INDENT + BOX_HALF, top: 0, height: '50%', zIndex: 0 }} />
                        <div className="absolute top-1/2 -translate-y-1/2 h-px bg-[#e3e2e0]" style={{ left: BASE_LEFT + (item.depth - 1) * INDENT + BOX_HALF, width: INDENT - BOX_HALF, zIndex: 0 }} />
                      </>
                    )}
                    <div className="w-3.5 h-3.5 border border-[#c1c0bd] flex-shrink-0" style={{ position: 'relative', zIndex: 1 }} />
                    <input
                      value={pendingDraft}
                      onChange={e => setPendingDraft(e.target.value)}
                      onBlur={commitPending}
                      onKeyDown={handlePendingKeyDown}
                      onClick={e => e.stopPropagation()}
                      className="flex-1 min-w-0 text-sm text-[#37352f] bg-transparent border-b border-[#37352f] focus:outline-none cursor-text"
                      autoFocus
                    />
                  </div>
                )}
              </Fragment>
            )
          })}
          </div>{/* maxHeight 클리핑 wrapper 끝 */}
          </div>
        </div>
      )}

      {/* 하단 행 — 세부항목 없을 때: + 세부항목(좌) + 생성일(우) / 있을 때: 생성일(우)만 */}
      <div className="flex items-center gap-1 mt-auto leading-none" onClick={e => e.stopPropagation()}>
        {/* + 세부항목 — 세부항목 없고 미완료일 때만, 호버 시 표시 */}
        {total === 0 && !task.is_done && (
          <div className="flex-1">
            {addingFirstSubtask ? (
              <input
                value={firstSubtaskDraft}
                onChange={e => setFirstSubtaskDraft(e.target.value)}
                onBlur={() => {
                  const text = firstSubtaskDraft.trim()
                  setAddingFirstSubtask(false)
                  setFirstSubtaskDraft('')
                  if (text) onFirstSubtaskCreate?.(text)
                }}
                onKeyDown={e => {
                  e.stopPropagation()
                  if (e.key === 'Enter') {
                    const text = firstSubtaskDraft.trim()
                    setAddingFirstSubtask(false)
                    setFirstSubtaskDraft('')
                    if (text) onFirstSubtaskCreate?.(text)
                  } else if (e.key === 'Escape') {
                    setAddingFirstSubtask(false)
                    setFirstSubtaskDraft('')
                  }
                }}
                onClick={e => e.stopPropagation()}
                placeholder="세부항목 추가..."
                className="text-xs text-[#37352f] placeholder:text-[#c1c0bd] bg-transparent border-b border-[#e3e2e0] focus:outline-none min-w-0 w-full"
                autoFocus
              />
            ) : (
              <div
                className="invisible group-hover:visible cursor-pointer"
                onClick={e => { e.stopPropagation(); setAddingFirstSubtask(true); setFirstSubtaskDraft('') }}
              >
                <span className="text-xs text-[#c1c0bd] hover:text-[#9b9a97]">+ 세부항목</span>
              </div>
            )}
          </div>
        )}
        {total > 0 && !task.is_done && (
          <div className="flex-1">
            {overflowCount > 0 && (
              <span
                className="text-xs text-[#c1c0bd] cursor-pointer hover:text-[#9b9a97] transition-colors"
                onClick={e => { e.stopPropagation(); onClick() }}
              >
                +{overflowCount}개 더
              </span>
            )}
          </div>
        )}

        {/* 완료 시 — 완료 날짜 왼쪽에 볼드로, 생성일은 오른쪽 유지 */}
        {task.is_done && (
          <div className="flex-1">
            {task.done_at && (
              <span style={{ fontSize: '10px', fontWeight: 700, color: '#9b9a97' }}>
                {formatCreatedAt(task.done_at)} 완료
              </span>
            )}
          </div>
        )}

        {/* 기약없음 / 기억용 토글 버튼 — 항상 표시, 활성 시 채움 */}
        <button
          onClick={e => { e.stopPropagation(); onNoDeadlineToggle?.() }}
          style={{
            fontSize: '10px', lineHeight: 1, padding: '3px 7px', borderRadius: 20,
            background: task.is_no_deadline ? '#e4e4e4' : 'transparent',
            color: task.is_no_deadline ? '#555' : '#c8c6c3',
            border: `1px solid ${task.is_no_deadline ? '#ccc' : '#e3e2e0'}`,
            cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >기약없음</button>
        <button
          onClick={e => { e.stopPropagation(); onMemoryToggle?.() }}
          style={{
            fontSize: '10px', lineHeight: 1, padding: '3px 7px', borderRadius: 20,
            background: task.is_memory ? '#FFE8D0' : 'transparent',
            color: task.is_memory ? '#C96A1A' : '#c8c6c3',
            border: `1px solid ${task.is_memory ? '#f0c49a' : '#e3e2e0'}`,
            cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >기억용</button>

        {/* 생성일 */}
        {editingCreatedAt ? (
          <input
            value={createdAtDraft}
            onChange={e => setCreatedAtDraft(e.target.value)}
            onBlur={() => {
              const match = createdAtDraft.trim().match(/^(\d{1,2})\.(\d{1,2})$/)
              if (match) {
                const iso = new Date(new Date().getFullYear(), parseInt(match[1]) - 1, parseInt(match[2])).toISOString()
                onCreatedAtChange?.(iso)
              }
              setEditingCreatedAt(false)
            }}
            onKeyDown={e => {
              e.stopPropagation()
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') setEditingCreatedAt(false)
            }}
            placeholder="M.D"
            ref={el => { if (el) { el.focus(); el.select() } }}
            style={{ fontSize: '10px', color: '#9b9a97', background: 'transparent', border: 'none', borderBottom: '1px solid #c1c0bd', outline: 'none', width: '36px', textAlign: 'right' }}
          />
        ) : (
          <span
            style={{ fontSize: '10px', color: '#d3d2d0', letterSpacing: '0.01em', cursor: 'pointer' }}
            title="클릭해서 날짜 수정"
            onClick={() => { setCreatedAtDraft(formatCreatedAt(task.created_at)); setEditingCreatedAt(true) }}
          >
            {formatCreatedAt(task.created_at)} 생성
          </span>
        )}
      </div>
    </div>
    </div>
    </div>
  )
}
