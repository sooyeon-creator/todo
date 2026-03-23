'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Copy, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface MeetingItem {
  id: string
  text: string
  assignee?: string
  // 이번주 이슈 전용: 5 Whys 분석
  whys?: string[]   // 길이 5 고정
  solution?: string
}

interface MeetingData {
  lastResult: MeetingItem[]
  thisIssue: MeetingItem[]
  decisions: MeetingItem[]
  nextActions: MeetingItem[]
}

// ─── 5 Whys 질문 프롬프트 ─────────────────────────────────────────────────────

const WHY_PROMPTS = [
  '왜 이 문제가 발생했나요?',
  '왜 그랬나요?',
  '왜 그랬나요?',
  '왜 그랬나요?',
  '근본 원인은 무엇인가요?',
]

// ─── Week utilities ───────────────────────────────────────────────────────────

function getMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function addWeeks(monday: Date, n: number): Date {
  const d = new Date(monday)
  d.setDate(d.getDate() + n * 7)
  return d
}

function weekKey(monday: Date): string {
  return monday.toISOString().slice(0, 10)
}

function formatWeekLabel(monday: Date): string {
  const m = monday.getMonth() + 1
  const d = monday.getDate()
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const em = sunday.getMonth() + 1
  const ed = sunday.getDate()
  const weekNum = Math.ceil(d / 7)
  return `${m}월 ${weekNum}째주  (${m}.${d} ~ ${em}.${ed})`
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

const STORAGE_PREFIX = 'ops_meeting_'

const EMPTY_DATA: MeetingData = {
  lastResult: [],
  thisIssue: [],
  decisions: [],
  nextActions: [],
}

function normalizeItem(raw: any): MeetingItem {
  return {
    id: raw.id ?? crypto.randomUUID(),
    text: raw.text ?? '',
    ...(raw.assignee !== undefined ? { assignee: raw.assignee } : {}),
    ...(raw.whys !== undefined ? { whys: raw.whys } : {}),
    ...(raw.solution !== undefined ? { solution: raw.solution } : {}),
  }
}

function loadData(key: string): MeetingData {
  if (typeof window === 'undefined') return { ...EMPTY_DATA }
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key)
    if (!raw) return { ...EMPTY_DATA }
    const parsed = JSON.parse(raw)
    return {
      lastResult: (parsed.lastResult ?? []).map(normalizeItem),
      thisIssue: (parsed.thisIssue ?? []).map(normalizeItem),
      decisions: (parsed.decisions ?? []).map(normalizeItem),
      nextActions: (parsed.nextActions ?? []).map(normalizeItem),
    }
  } catch {
    return { ...EMPTY_DATA }
  }
}

function saveData(key: string, data: MeetingData) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(data))
  } catch {
    // QuotaExceededError 등 무시 (현재 세션에서는 데이터 유지)
  }
}

function newItem(text = ''): MeetingItem {
  return { id: crypto.randomUUID(), text }
}

function newIssueItem(text = ''): MeetingItem {
  return {
    id: crypto.randomUUID(),
    text,
    whys: ['', '', '', '', ''],
    solution: '',
  }
}

// ─── Section config ───────────────────────────────────────────────────────────

const SECTIONS = [
  { key: 'lastResult' as const, label: '지난주 결과', hasAssignee: false, hasAnalysis: false },
  { key: 'thisIssue' as const, label: '이번주 이슈', hasAssignee: false, hasAnalysis: true },
  { key: 'decisions' as const, label: '결정 필요 사항', hasAssignee: false, hasAnalysis: false },
  { key: 'nextActions' as const, label: '다음 액션', hasAssignee: true, hasAnalysis: false },
]

// ─── 5 Whys 아코디언 ──────────────────────────────────────────────────────────

function FiveWhysPanel({
  item,
  onUpdateWhy,
  onUpdateSolution,
}: {
  item: MeetingItem
  onUpdateWhy: (index: number, value: string) => void
  onUpdateSolution: (value: string) => void
}) {
  const whys = item.whys ?? ['', '', '', '', '']
  const solution = item.solution ?? ''

  return (
    <div style={{
      background: '#fafaf8',
      borderTop: '1px solid #eeede9',
      padding: '12px 14px 14px',
    }}>
      <div style={{
        fontSize: 11, fontWeight: 600, color: '#9b9a97',
        marginBottom: 10, letterSpacing: 0.3,
        fontFamily: "'Toss Product Sans', 'Pretendard Variable', Pretendard, sans-serif",
      }}>
        🔍 5 Whys 원인 분석
      </div>

      {WHY_PROMPTS.map((prompt, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-start' }}>
          {/* Why 레이블 */}
          <div style={{
            flexShrink: 0, width: 60,
            fontSize: 11, fontWeight: 600,
            color: whys[i].trim() ? '#5b5bd6' : '#c4c3bf',
            paddingTop: 5,
            fontFamily: "'Toss Product Sans', 'Pretendard Variable', Pretendard, sans-serif",
            transition: 'color 0.2s',
          }}>
            Why {i + 1}
          </div>

          {/* Why 입력 */}
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: 10, color: '#b5b4b0', marginBottom: 2,
              fontFamily: "'Toss Product Sans', 'Pretendard Variable', Pretendard, sans-serif",
            }}>
              {prompt}
            </div>
            <input
              type="text"
              value={whys[i]}
              onChange={e => onUpdateWhy(i, e.target.value)}
              placeholder={`Why ${i + 1} 답변...`}
              style={{
                width: '100%', fontSize: 12, color: '#37352f',
                background: 'white', border: '1px solid #e3e2e0',
                borderRadius: 6, padding: '5px 8px', outline: 'none',
                fontFamily: "'Toss Product Sans', 'Pretendard Variable', Pretendard, sans-serif",
                boxSizing: 'border-box',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = '#a8a5ff' }}
              onBlur={e => { e.currentTarget.style.borderColor = '#e3e2e0' }}
            />
          </div>
        </div>
      ))}

      {/* 해결방안 */}
      <div style={{
        borderTop: '1px dashed #e3e2e0', paddingTop: 10, marginTop: 4,
        display: 'flex', gap: 8, alignItems: 'flex-start',
      }}>
        <div style={{
          flexShrink: 0, width: 60,
          fontSize: 11, fontWeight: 600,
          color: solution.trim() ? '#16a34a' : '#c4c3bf',
          paddingTop: 5,
          fontFamily: "'Toss Product Sans', 'Pretendard Variable', Pretendard, sans-serif",
          transition: 'color 0.2s',
        }}>
          해결방안
        </div>
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: 10, color: '#b5b4b0', marginBottom: 2,
            fontFamily: "'Toss Product Sans', 'Pretendard Variable', Pretendard, sans-serif",
          }}>
            근본 원인을 해결할 방법은?
          </div>
          <textarea
            value={solution}
            onChange={e => onUpdateSolution(e.target.value)}
            placeholder="해결방안을 입력하세요..."
            rows={2}
            style={{
              width: '100%', fontSize: 12, color: '#37352f',
              background: 'white', border: '1px solid #e3e2e0',
              borderRadius: 6, padding: '5px 8px', outline: 'none', resize: 'none',
              fontFamily: "'Toss Product Sans', 'Pretendard Variable', Pretendard, sans-serif",
              boxSizing: 'border-box', lineHeight: 1.5,
            }}
            onFocus={e => { e.currentTarget.style.borderColor = '#86efac' }}
            onBlur={e => { e.currentTarget.style.borderColor = '#e3e2e0' }}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MeetingTab({ isMobile = false }: { isMobile?: boolean }) {
  const [weekMonday, setWeekMonday] = useState(() => getMonday(new Date()))
  const key = weekKey(weekMonday)
  const [data, setData] = useState<MeetingData>(() => loadData(key))
  const [copied, setCopied] = useState(false)
  // 5 Whys 패널 열린 이슈 ID 목록 (UI 상태만, 저장 안 함)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  // 주차 변경 시 해당 주 데이터 로드 + 아코디언 리셋
  useEffect(() => {
    setData(loadData(key))
    setExpandedIds(new Set())
  }, [key])

  // 데이터 변경 시 자동 저장
  useEffect(() => {
    saveData(key, data)
  }, [key, data])

  const setSection = useCallback(<K extends keyof MeetingData>(
    section: K,
    updater: (prev: MeetingData[K]) => MeetingData[K]
  ) => {
    setData(d => ({ ...d, [section]: updater(d[section]) }))
  }, [])

  const addItem = (section: keyof MeetingData, hasAnalysis: boolean) => {
    const creator = hasAnalysis ? newIssueItem : newItem
    setSection(section, items => [...(items as MeetingItem[]), creator()] as MeetingData[typeof section])
  }

  const updateItem = (section: keyof MeetingData, id: string, patch: Partial<MeetingItem>) => {
    setSection(section, items =>
      (items as MeetingItem[]).map(it => it.id === id ? { ...it, ...patch } : it) as MeetingData[typeof section]
    )
  }

  const deleteItem = (section: keyof MeetingData, id: string) => {
    setSection(section, items =>
      (items as MeetingItem[]).filter(it => it.id !== id) as MeetingData[typeof section]
    )
    setExpandedIds(prev => { const s = new Set(prev); s.delete(id); return s })
  }

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }

  const updateWhy = (id: string, index: number, value: string) => {
    setSection('thisIssue', items =>
      (items as MeetingItem[]).map(it => {
        if (it.id !== id) return it
        const whys = [...(it.whys ?? ['', '', '', '', ''])]
        whys[index] = value
        return { ...it, whys }
      }) as MeetingData['thisIssue']
    )
  }

  const handleCopy = () => {
    const label = formatWeekLabel(weekMonday)

    // 이번주 이슈 복사 시 5 Whys 포함
    const issueLines = data.thisIssue.length
      ? data.thisIssue.flatMap(i => {
          const lines: string[] = [`• ${i.text || '(내용 없음)'}`]
          const whys = i.whys ?? []
          const filledWhys = whys.map((w, idx) => ({ idx, w })).filter(({ w }) => w.trim())
          if (filledWhys.length > 0) {
            lines.push('  [원인 분석]')
            filledWhys.forEach(({ idx, w }) => lines.push(`  Why ${idx + 1}: ${w}`))
          }
          if (i.solution?.trim()) lines.push(`  해결방안: ${i.solution}`)
          return lines
        })
      : ['• (없음)']

    const lines = [
      `📋 ${label} 운영진 미팅`,
      '',
      '1. 지난주 결과',
      ...(data.lastResult.length ? data.lastResult.map(i => `• ${i.text || '(내용 없음)'}`) : ['• (없음)']),
      '',
      '2. 이번주 이슈',
      ...issueLines,
      '',
      '3. 결정 필요 사항',
      ...(data.decisions.length ? data.decisions.map(i => `• ${i.text || '(내용 없음)'}`) : ['• (없음)']),
      '',
      '4. 다음 액션',
      ...(data.nextActions.length
        ? data.nextActions.map(i => `• [ ] ${i.text || '(내용 없음)'}${i.assignee ? `  담당: ${i.assignee}` : ''}`)
        : ['• (없음)']),
    ]
    navigator.clipboard.writeText(lines.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const todayKey = weekKey(getMonday(new Date()))
  const isCurrentWeek = key === todayKey

  return (
    <div style={{ padding: isMobile ? '16px 0 80px' : '24px 0 80px', maxWidth: 680, margin: '0 auto' }}>
      {/* ── 헤더 ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        <button
          onClick={() => setWeekMonday(w => addWeeks(w, -1))}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 6, border: '1px solid #e3e2e0', background: 'white', cursor: 'pointer', color: '#9b9a97' }}
        >
          <ChevronLeft size={14} />
        </button>

        <span style={{
          fontSize: 14, fontWeight: 600, color: '#37352f',
          minWidth: 180, textAlign: 'center',
          fontFamily: "'Toss Product Sans', 'Pretendard Variable', Pretendard, sans-serif",
        }}>
          {formatWeekLabel(weekMonday)}
        </span>

        <button
          onClick={() => setWeekMonday(w => addWeeks(w, 1))}
          disabled={isCurrentWeek}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 6, border: '1px solid #e3e2e0', background: 'white', cursor: isCurrentWeek ? 'not-allowed' : 'pointer', color: isCurrentWeek ? '#d3d2d0' : '#9b9a97' }}
        >
          <ChevronRight size={14} />
        </button>

        {!isCurrentWeek && (
          <button
            onClick={() => setWeekMonday(getMonday(new Date()))}
            style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid #e3e2e0', background: 'white', cursor: 'pointer', color: '#9b9a97' }}
          >
            이번주
          </button>
        )}

        <div style={{ flex: 1 }} />

        <button
          onClick={handleCopy}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 12, padding: '5px 12px', borderRadius: 6,
            border: '1px solid #e3e2e0',
            background: copied ? '#f0fdf4' : 'white',
            color: copied ? '#16a34a' : '#9b9a97',
            cursor: 'pointer', transition: 'all 0.2s',
            fontFamily: "'Toss Product Sans', 'Pretendard Variable', Pretendard, sans-serif",
          }}
        >
          <Copy size={12} />
          {copied ? '복사됨 ✓' : '불릿 복사'}
        </button>
      </div>

      {/* ── 섹션 목록 ── */}
      {SECTIONS.map((section, si) => {
        const items = data[section.key] as MeetingItem[]
        return (
          <div
            key={section.key}
            style={{
              marginBottom: 14,
              background: 'white',
              borderRadius: 10,
              border: '1px solid #e3e2e0',
              overflow: 'hidden',
            }}
          >
            {/* 섹션 헤더 */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px',
              background: '#f7f6f3',
              borderBottom: items.length > 0 ? '1px solid #eeede9' : 'none',
            }}>
              <span style={{
                fontSize: 12, fontWeight: 600, color: '#37352f',
                fontFamily: "'Toss Product Sans', 'Pretendard Variable', Pretendard, sans-serif",
              }}>
                {si + 1}. {section.label}
                {section.hasAnalysis && (
                  <span style={{ fontSize: 10, fontWeight: 400, color: '#9b9a97', marginLeft: 6 }}>
                    (5 Whys 분석 포함)
                  </span>
                )}
              </span>
              <button
                onClick={() => addItem(section.key, section.hasAnalysis)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 3,
                  fontSize: 11, color: '#9b9a97', cursor: 'pointer',
                  background: 'none', border: 'none', padding: '2px 4px', borderRadius: 4,
                }}
              >
                <Plus size={11} /> 추가
              </button>
            </div>

            {/* 아이템 목록 */}
            {items.map((item, idx) => {
              const isExpanded = expandedIds.has(item.id)
              const hasAnalysisData = section.hasAnalysis &&
                ((item.whys ?? []).some(w => w.trim()) || (item.solution ?? '').trim())

              return (
                <div
                  key={item.id}
                  style={{ borderBottom: idx < items.length - 1 ? '1px solid #f5f4f1' : 'none' }}
                >
                  {/* 이슈 텍스트 행 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px' }}>
                    <span style={{ color: '#c4c3bf', fontSize: 16, flexShrink: 0, lineHeight: 1 }}>•</span>
                    <input
                      type="text"
                      value={item.text}
                      onChange={e => updateItem(section.key, item.id, { text: e.target.value })}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); addItem(section.key, section.hasAnalysis) }
                        if (e.key === 'Backspace' && item.text === '') {
                          e.preventDefault()
                          deleteItem(section.key, item.id)
                        }
                      }}
                      placeholder="내용을 입력하세요"
                      autoFocus={idx === items.length - 1 && item.text === ''}
                      style={{
                        flex: 1, fontSize: 13, color: '#37352f',
                        background: 'transparent', border: 'none', outline: 'none',
                        fontFamily: "'Toss Product Sans', 'Pretendard Variable', Pretendard, sans-serif",
                      }}
                    />

                    {/* 담당자 (nextActions 섹션) */}
                    {section.hasAssignee && (
                      <input
                        type="text"
                        value={item.assignee ?? ''}
                        onChange={e => updateItem(section.key, item.id, { assignee: e.target.value })}
                        placeholder="담당자"
                        style={{
                          width: 64, fontSize: 11, color: '#9b9a97',
                          background: '#f5f4f1', border: 'none', outline: 'none',
                          borderRadius: 4, padding: '2px 6px',
                        }}
                      />
                    )}

                    {/* 5 Whys 토글 버튼 (이번주 이슈 섹션만) */}
                    {section.hasAnalysis && (
                      <button
                        onClick={() => toggleExpanded(item.id)}
                        title="5 Whys 원인 분석"
                        style={{
                          display: 'flex', alignItems: 'center', gap: 2,
                          fontSize: 10, padding: '2px 6px', borderRadius: 4,
                          border: `1px solid ${isExpanded ? '#a8a5ff' : (hasAnalysisData ? '#c4c3ff' : '#e3e2e0')}`,
                          background: isExpanded ? '#f0efff' : (hasAnalysisData ? '#f5f4ff' : 'transparent'),
                          color: isExpanded ? '#5b5bd6' : (hasAnalysisData ? '#7c7adc' : '#c4c3bf'),
                          cursor: 'pointer', transition: 'all 0.15s',
                          fontFamily: "'Toss Product Sans', 'Pretendard Variable', Pretendard, sans-serif",
                          flexShrink: 0,
                        }}
                      >
                        🔍
                        {isExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                      </button>
                    )}

                    <button
                      onClick={() => deleteItem(section.key, item.id)}
                      style={{
                        color: '#d3d2d0', background: 'none', border: 'none',
                        cursor: 'pointer', padding: 2, borderRadius: 4, flexShrink: 0,
                        display: 'flex', alignItems: 'center',
                      }}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>

                  {/* 5 Whys 아코디언 패널 */}
                  {section.hasAnalysis && isExpanded && (
                    <FiveWhysPanel
                      item={item}
                      onUpdateWhy={(index, value) => updateWhy(item.id, index, value)}
                      onUpdateSolution={value => updateItem('thisIssue', item.id, { solution: value })}
                    />
                  )}
                </div>
              )
            })}

            {/* 빈 상태 */}
            {items.length === 0 && (
              <div
                onClick={() => addItem(section.key, section.hasAnalysis)}
                style={{
                  padding: '10px 14px', color: '#c4c3bf', fontSize: 12,
                  cursor: 'pointer',
                  fontFamily: "'Toss Product Sans', 'Pretendard Variable', Pretendard, sans-serif",
                }}
              >
                + 항목 추가
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
