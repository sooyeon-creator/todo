'use client'

import { useEffect, useCallback, useState, useRef, useMemo } from 'react'
import type { Editor } from '@tiptap/react'
import { useEditor, EditorContent, ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Placeholder from '@tiptap/extension-placeholder'
import { Extension } from '@tiptap/core'
import { Task } from '@/types'
import { SupabaseClient } from '@supabase/supabase-js'
import { getCheckboxStats } from '@/lib/checkboxStats'
import { getSubtaskItems } from '@/lib/taskItems'
import { X, CheckCircle, CheckSquare } from 'lucide-react'

// ─── doc에서 계층 번호 계산 ─────────────────────────────────────
function computeHierarchicalLabel(editor: Editor, myPos: number): string {
  const doc = editor.state.doc
  const items: { pos: number; depth: number }[] = []

  doc.descendants((n, pos) => {
    if (n.type.name !== 'taskItem') return
    let hasText = false
    n.forEach(child => { if (child.type.name !== 'taskList' && child.textContent.trim()) hasText = true })
    if (!hasText) return
    const $pos = doc.resolve(pos)
    const depth = Math.round(($pos.depth - 1) / 2)
    items.push({ pos, depth })
  })

  const counters: number[] = []
  const labelMap = new Map<number, string>()
  for (const item of items) {
    const d = item.depth
    while (counters.length <= d) counters.push(0)
    counters[d]++
    for (let i = d + 1; i < counters.length; i++) counters[i] = 0
    labelMap.set(item.pos, counters.slice(0, d + 1).join('-'))
  }
  return labelMap.get(myPos) ?? ''
}

// ─── TaskItem NodeView: 번호박스 + 날짜 표시/수정 ──────────────
function TaskItemNodeView({ node, updateAttributes, getPos, editor }: NodeViewProps) {
  const checked = node.attrs.checked as boolean
  const checkedAt = node.attrs.checkedAt as string | null
  const [editingDate, setEditingDate] = useState(false)
  const [dateDraft, setDateDraft] = useState('')

  // 계층 번호 라벨 계산
  const label = useMemo(() => {
    if (!editor) return ''
    const pos = typeof getPos === 'function' ? getPos() : undefined
    if (pos === undefined) return ''
    return computeHierarchicalLabel(editor, pos)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor?.state.doc, getPos])

  const isSingleChar = label.length === 1
  const depth = label ? (label.match(/-/g) || []).length : 0

  function toggleChecked(noDate = false) {
    const nowChecked = !checked
    updateAttributes({ checked: nowChecked, checkedAt: (nowChecked && !noDate) ? new Date().toISOString() : null })
  }

  function fmtDate(iso: string) {
    const d = new Date(iso)
    return `${d.getMonth() + 1}.${d.getDate()}`
  }

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation(); e.preventDefault()
    setDateDraft(checkedAt ? fmtDate(checkedAt) : '')
    setEditingDate(true)
  }

  function commitEdit() {
    setEditingDate(false)
    const txt = dateDraft.trim()
    if (!txt) { updateAttributes({ checkedAt: null }); return }
    const parts = txt.split('.')
    if (parts.length === 2) {
      const m = parseInt(parts[0]), d = parseInt(parts[1])
      if (!isNaN(m) && !isNaN(d) && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        updateAttributes({ checkedAt: new Date(new Date().getFullYear(), m - 1, d).toISOString() })
        return
      }
    }
    updateAttributes({ checkedAt: null })
  }

  function handleDateKey(e: React.KeyboardEvent) {
    e.stopPropagation()
    if (e.key === 'Enter') commitEdit()
    if (e.key === 'Escape') setEditingDate(false)
  }

  return (
    <NodeViewWrapper as="li" data-type="taskItem" data-checked={checked}
      style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', listStyle: 'none', position: 'relative' }}
    >
      {/* 트리 커넥터 — 수직선(부모 중심→현재 중심) + 수평선(버튼 중앙) */}
      {depth > 0 && (
        <>
          {/* 수직선: 부모 버튼 밑면(-7px)에서 자식 버튼 중심(10px)까지 */}
          <span contentEditable={false} style={{
            position: 'absolute',
            left: -33,
            top: -7,
            width: 0,
            height: 17,
            borderLeft: '1.5px solid #d1d0cd',
            pointerEvents: 'none',
          }} />
          {/* 수평선: x=-33(부모 버튼 중심)에서 x=0(자식 버튼 왼쪽)까지 */}
          <span contentEditable={false} style={{
            position: 'absolute',
            left: -33,
            top: 10,
            width: 33,
            height: 0,
            borderBottom: '1.5px solid #d1d0cd',
            borderBottomLeftRadius: 2,
            pointerEvents: 'none',
          }} />
        </>
      )}
      {/* 번호 박스 — 1lh 래퍼: 정확히 첫 줄 높이만큼, 버튼을 수직 중앙에 배치 */}
      <span contentEditable={false} style={{ display: 'inline-flex', height: '1lh', lineHeight: 1.5, alignItems: 'center', flexShrink: 0, alignSelf: 'flex-start' }}>
      <button
        contentEditable={false}
        onClick={e => { e.stopPropagation(); e.preventDefault(); toggleChecked(e.ctrlKey || e.metaKey) }}
        style={{
          width: isSingleChar ? '14px' : 'auto',
          height: '14px',
          padding: isSingleChar ? '0' : '0 3px',
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: `1px solid ${checked ? '#9b9a97' : '#c1c0bd'}`,
          borderRadius: '0px',
          backgroundColor: checked ? '#9b9a97' : 'transparent',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <span style={{ fontSize: '9px', fontWeight: 500, lineHeight: 1, whiteSpace: 'nowrap', color: checked ? 'white' : '#c1c0bd' }}>
          {label}
        </span>
      </button>
      </span>

      <NodeViewContent as="div" className="content" />

      {checked && (
        <span contentEditable={false} className="task-date-tag" style={{ position: 'absolute', right: '-56px' }}>
          {editingDate ? (
            <input
              value={dateDraft}
              onChange={e => setDateDraft(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={handleDateKey}
              placeholder="M.D"
              ref={el => { if (el) { el.focus(); el.select() } }}
              onClick={e => e.stopPropagation()}
              className="task-date-input"
            />
          ) : (
            <span className="task-date-display" onClick={startEdit}>
              {checkedAt ? `(${fmtDate(checkedAt)})` : '(날짜)'}
            </span>
          )}
        </span>
      )}
    </NodeViewWrapper>
  )
}

// checkedAt attr 추가 + NodeView 연결
const TaskItemWithDate = TaskItem.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      checkedAt: {
        default: null,
        keepOnSplit: false,
        parseHTML: el => el.getAttribute('data-checked-at') || null,
        renderHTML: attrs => attrs.checkedAt ? { 'data-checked-at': attrs.checkedAt } : {},
      },
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(TaskItemNodeView)
  },
  addProseMirrorPlugins() {
    return []  // NodeView가 체크박스 클릭 처리
  },
})

// /[] 입력 시 체크박스 삽입 + Tab 들여쓰기 — 커서 위치 무관하게 동작
const SlashCheckbox = Extension.create({
  name: 'slashCheckbox',
  // TaskItem 기본 Tab 핸들러보다 높은 우선순위로 먼저 가로챔
  priority: 200,
  addKeyboardShortcuts() {
    return {
      ']': ({ editor }) => {
        const { state } = editor
        const { from } = state.selection
        if (from < 2) return false
        try {
          const textBefore = state.doc.textBetween(from - 2, from)
          if (textBefore === '/[') {
            editor.chain()
              .deleteRange({ from: from - 2, to: from })
              .toggleTaskList()
              .run()
            return true
          }
        } catch {
          // 노드 경계 오류 무시
        }
        return false
      },

      // Tab: 커서가 taskItem 안에 있으면 항상 들여쓰기
      Tab: ({ editor }) => {
        const { state } = editor
        const { $from } = state.selection
        // taskItem 노드 안에 있는지 확인
        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type.name === 'taskItem') {
            return editor.commands.sinkListItem('taskItem')
          }
        }
        return false  // taskItem 밖이면 기본 동작
      },

      // Shift-Tab: 커서가 taskItem 안에 있으면 항상 내어쓰기
      'Shift-Tab': ({ editor }) => {
        const { state } = editor
        const { $from } = state.selection
        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type.name === 'taskItem') {
            return editor.commands.liftListItem('taskItem')
          }
        }
        return false
      },
    }
  },
})

interface Props {
  task: Task
  onClose: () => void
  onUpdate: (task: Task) => void
  supabase: SupabaseClient
}

export default function TaskCanvas({ task, onClose, onUpdate, supabase }: Props) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(task.title)
  const [noteDraft, setNoteDraft] = useState(task.note ?? '')
  const [liveStats, setLiveStats] = useState(() => getCheckboxStats(task.description))

  // ─── 너비 리사이즈 ────────────────────────────────
  const [canvasWidth, setCanvasWidth] = useState(512)
  const isResizingCanvas = useRef(false)
  const resizeStartX = useRef(0)
  const resizeStartWidth = useRef(0)

  const onResizeMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizingCanvas.current) return
    const delta = resizeStartX.current - e.clientX
    setCanvasWidth(Math.max(320, Math.min(window.innerWidth * 0.85, resizeStartWidth.current + delta)))
  }, [])

  const onResizeMouseUp = useCallback(() => {
    isResizingCanvas.current = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    window.removeEventListener('mousemove', onResizeMouseMove)
    window.removeEventListener('mouseup', onResizeMouseUp)
  }, [onResizeMouseMove])

  function onResizeStart(e: React.MouseEvent) {
    e.preventDefault()
    isResizingCanvas.current = true
    resizeStartX.current = e.clientX
    resizeStartWidth.current = canvasWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onResizeMouseMove)
    window.addEventListener('mouseup', onResizeMouseUp)
  }

  const syncingRef = useRef(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prevDocRef = useRef<any>(null)

  // 재귀: taskItem 노드의 모든 자손(자식·손자…) 위치를 수집
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function collectAllDescendants(doc: any, itemNode: any, itemPos: number): Array<{ pos: number }> {
    const result: Array<{ pos: number }> = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let nestedList: any = null
    let nestedListOffset = -1
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    itemNode.forEach((child: any, offset: number) => {
      if (child.type.name === 'taskList' && nestedList === null) {
        nestedList = child
        nestedListOffset = offset
      }
    })
    if (!nestedList) return result

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nestedList.forEach((childItem: any, childOffset: number) => {
      if (childItem.type.name !== 'taskItem') return
      const childPos = itemPos + 1 + nestedListOffset + 1 + childOffset
      try {
        const nodeAt = doc.nodeAt(childPos)
        if (nodeAt?.type.name === 'taskItem') {
          result.push({ pos: childPos })
          // 손자 이하 재귀
          result.push(...collectAllDescendants(doc, childItem, childPos))
        }
      } catch { /* 노드 경계 오류 무시 */ }
    })
    return result
  }

  function syncCheckboxes(editor: Editor) {
    if (syncingRef.current) return

    const { doc } = editor.state
    const prevDoc = prevDocRef.current
    const changes: Array<{ pos: number; checked: boolean }> = []

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    doc.descendants((node: any, pos: number) => {
      if (node.type.name !== 'taskItem') return true

      // 직계 자식 taskList 탐색
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let nestedList: any = null
      let nestedListOffset = -1
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      node.forEach((child: any, offset: number) => {
        if (child.type.name === 'taskList' && nestedList === null) {
          nestedList = child
          nestedListOffset = offset
        }
      })
      if (!nestedList) return true

      const parentChecked: boolean = node.attrs.checked
      const prevParentNode = prevDoc ? prevDoc.nodeAt(pos) : null
      const prevParentChecked: boolean = prevParentNode ? prevParentNode.attrs.checked : parentChecked
      const parentJustChanged = prevParentChecked !== parentChecked

      // 직계 자식 수집
      const children: Array<{ pos: number; checked: boolean }> = []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nestedList.forEach((child: any, childOffset: number) => {
        if (child.type.name !== 'taskItem') return
        const childPos = pos + 1 + nestedListOffset + 1 + childOffset
        try {
          const nodeAt = doc.nodeAt(childPos)
          if (nodeAt?.type.name === 'taskItem') {
            children.push({ pos: childPos, checked: child.attrs.checked })
          }
        } catch { /* 노드 경계 오류 무시 */ }
      })
      if (children.length === 0) return true

      if (parentJustChanged) {
        // 부모가 변경됨 → 자손 전체(자식·손자…)에 동기화
        const allDescendants = collectAllDescendants(doc, node, pos)
        allDescendants.forEach(({ pos: dPos }) => {
          try {
            const dNode = doc.nodeAt(dPos)
            if (dNode?.type.name === 'taskItem' && dNode.attrs.checked !== parentChecked) {
              changes.push({ pos: dPos, checked: parentChecked })
            }
          } catch { /* 무시 */ }
        })
      } else {
        // 자식이 바뀜 → 모두 체크됐을 때만 부모를 체크 (해제는 전파하지 않음)
        const allChildrenChecked = children.every(c => c.checked)
        if (allChildrenChecked && !parentChecked) {
          changes.push({ pos, checked: true })
        }
      }

      return true
    })

    if (changes.length > 0) {
      syncingRef.current = true
      editor.chain().command(({ tr, state: s }) => {
        for (const { pos, checked } of changes) {
          try {
            const nodeAt = s.doc.nodeAt(pos)
            if (nodeAt) tr.setNodeMarkup(pos, undefined, { ...nodeAt.attrs, checked })
          } catch { /* 노드 경계 오류 무시 */ }
        }
        return true
      }).run()
      syncingRef.current = false
      prevDocRef.current = editor.state.doc
    } else {
      prevDocRef.current = doc
    }
  }

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: false }),
      TaskList,
      TaskItemWithDate.configure({ nested: true }),
      Placeholder.configure({ placeholder: '세부 할 일을 적어보세요. /[] 로 체크박스를 추가할 수 있어요.' }),
      SlashCheckbox,
    ],
    content: (task.description as object) || '',
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[200px] text-[#37352f] text-[13px] font-medium pr-14',
      },
    },
    onUpdate: ({ editor }) => {
      const json = editor.getJSON()
      setLiveStats(getCheckboxStats(json))
      handleContentChange(json)
      syncCheckboxes(editor)
    },
  })

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleContentChange = useCallback(
    debounce(async (json: object) => {
      const stats = getCheckboxStats(json)
      const allChecked = stats.total > 0 && stats.checked === stats.total
      const is_done = allChecked

      // done_at: 완료된 경우 서브태스크 checkedAt 중 가장 최신 날짜를 사용.
      // 사용자가 캔버스에서 날짜를 수정하면 done_at도 자동으로 동기화됨.
      let done_at: string | null = null
      if (allChecked) {
        const items = getSubtaskItems(json)
        const dates = items.filter(i => i.checked && i.checkedAt).map(i => i.checkedAt!)
        done_at = dates.length > 0
          ? dates.reduce((max, d) => (d > max ? d : max))
          : null
      }

      const updated: Task = { ...task, description: json, is_done, done_at }
      onUpdate(updated)

      await supabase
        .from('tasks')
        .update({ description: json, is_done, done_at })
        .eq('id', task.id)
    }, 600),
    [task.id]
  )

  async function commitTitleEdit() {
    const title = titleDraft.trim()
    setEditingTitle(false)
    if (!title || title === task.title) return
    onUpdate({ ...task, title })
    await supabase.from('tasks').update({ title }).eq('id', task.id)
  }

  function handleTitleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') commitTitleEdit()
    if (e.key === 'Escape') setEditingTitle(false)
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !editingTitle) onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, editingTitle])

  useEffect(() => {
    if (!editingTitle) setTitleDraft(task.title)
  }, [task.title, editingTitle])

  // 캔버스 열린 동안 배경 스크롤 잠금
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const progress = liveStats.total > 0 ? Math.round((liveStats.checked / liveStats.total) * 100) : 0
  const allDone = liveStats.total > 0 && liveStats.checked === liveStats.total


  return (
    <>
      <div className="fixed inset-0 bg-black/10 z-40" onClick={onClose} />

      <div className="fixed right-0 top-0 h-full bg-white border-l border-[#e3e2e0] shadow-xl z-50 flex flex-col" style={{ width: canvasWidth }}>
        {/* 왼쪽 리사이즈 핸들 */}
        <div
          onMouseDown={onResizeStart}
          style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: 6,
            cursor: 'col-resize', zIndex: 10,
            background: 'transparent',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(59,130,246,0.15)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        />

        {/* 헤더 — 아이콘 + 큰 제목 */}
        <div className="px-6 pt-7 pb-5 border-b border-[#e3e2e0]">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              {/* 아이콘 */}
              <div className="w-9 h-9 bg-[#f7f6f3] border border-[#e3e2e0] flex items-center justify-center flex-shrink-0 mt-0.5">
                <CheckSquare size={17} className="text-[#37352f]" />
              </div>
              {/* 제목 */}
              {editingTitle ? (
                <input
                  value={titleDraft}
                  onChange={e => setTitleDraft(e.target.value)}
                  onBlur={commitTitleEdit}
                  onKeyDown={handleTitleKeyDown}
                  className="flex-1 text-xl font-bold text-[#37352f] bg-transparent border-b border-[#37352f] focus:outline-none leading-tight"
                  autoFocus
                />
              ) : (
                <h2
                  className="text-xl font-bold text-[#37352f] cursor-text hover:opacity-60 transition-opacity leading-tight"
                  onClick={() => { setEditingTitle(true); setTitleDraft(task.title) }}
                >
                  {task.title}
                </h2>
              )}
            </div>
            <button onClick={onClose} className="text-[#9b9a97] hover:text-[#37352f] flex-shrink-0 mt-1 transition-colors">
              <X size={18} />
            </button>
          </div>

          {/* 설명 */}
          <textarea
            value={noteDraft}
            onChange={e => setNoteDraft(e.target.value)}
            onBlur={async () => {
              const updated = { ...task, note: noteDraft }
              onUpdate(updated)
              await supabase.from('tasks').update({ note: noteDraft }).eq('id', task.id)
            }}
            placeholder="설명 추가..."
            rows={1}
            className="w-full mt-1 text-sm text-[#9b9a97] placeholder:text-[#c1c0bd] bg-transparent focus:outline-none resize-none leading-relaxed"
            style={{ overflow: 'hidden', height: 'auto' }}
            onInput={e => {
              const el = e.currentTarget
              el.style.height = 'auto'
              el.style.height = `${el.scrollHeight}px`
            }}
          />

          {/* 진행도 — X of Y + 게이지 + % */}
          {liveStats.total > 0 && (
            <div className="mt-4">
              <div className="inline-flex items-center gap-2.5 bg-[#f7f6f3] border border-[#e3e2e0] rounded-full px-3 py-1.5">
                <CheckCircle
                  size={13}
                  className={allDone ? 'text-green-500' : 'text-[#c1c0bd]'}
                />
                <span className="text-xs text-[#787774] font-medium whitespace-nowrap">
                  {liveStats.checked} of {liveStats.total}
                </span>
                <div className="w-24 h-1.5 bg-[#e3e2e0] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all duration-150"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="text-xs font-semibold text-[#37352f] w-7 text-right">
                  {progress}%
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 에디터 */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <EditorContent editor={editor} />
        </div>

        {/* 단축키 힌트 */}
        <div className="px-6 py-3 border-t border-[#e3e2e0] bg-[#f7f6f3]">
          <p className="text-xs text-[#9b9a97]">
            <kbd className="px-1 py-0.5 bg-[#e3e2e0] text-xs">/[]</kbd> 체크박스 추가 &nbsp;·&nbsp;
            <kbd className="px-1 py-0.5 bg-[#e3e2e0] text-xs">ESC</kbd> 닫기 &nbsp;·&nbsp;
            <span style={{ color: '#5c72e0', fontWeight: 600 }}>
              <kbd className="px-1 py-0.5 text-xs" style={{ background: '#dde3f8', color: '#5c72e0' }}>⌘</kbd>+체크
            </span> 날짜 기록 없이 완료
          </p>
        </div>
      </div>
    </>
  )
}

function debounce<T extends unknown[]>(fn: (...args: T) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout>
  return (...args: T) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}
