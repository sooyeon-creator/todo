import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const NOTION_API = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'

function notionHeaders(apiKey: string) {
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  }
}

// rich_text 배열 → 일반 텍스트
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function richTextToPlain(rt: any[]): string {
  return (rt ?? []).map((t: { plain_text: string }) => t.plain_text).join('')
}

// 페이지 제목 추출
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getPageTitle(page: any): string {
  const props = page.properties ?? {}
  for (const key of Object.keys(props)) {
    const prop = props[key]
    if (prop.type === 'title') return richTextToPlain(prop.title)
  }
  return '(제목 없음)'
}

// 페이지 상태명 추출 (status 또는 select 속성)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getPageStatus(page: any): string {
  const props = page.properties ?? {}
  for (const prop of Object.values(props) as any[]) {
    if (prop.type === 'status') return (prop.status?.name ?? '').trim()
    if (prop.type === 'select') return (prop.select?.name ?? '').trim()
  }
  return ''
}

// 페이지 완료 여부 추출
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getPageDone(page: any): boolean {
  const props = page.properties ?? {}
  for (const prop of Object.values(props) as any[]) {
    if (prop.type === 'checkbox') return !!prop.checkbox
    if (prop.type === 'status') {
      const name = (prop.status?.name ?? '').toLowerCase()
      // 영어("done", "complete") + 한국어("완료") 모두 처리
      return name.includes('done') || name.includes('complete') || name === '완료'
    }
    if (prop.type === 'select') {
      const name = (prop.select?.name ?? '').toLowerCase()
      return name.includes('done') || name.includes('complete') || name === '완료'
    }
  }
  return false
}

// 기억용 여부: 상태가 "기억용"인 항목
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getPageMemory(page: any): boolean {
  const status = getPageStatus(page).toLowerCase()
  return status === '기억용' || status.includes('기억')
}

// 페이지 완료 시각 추출
// 우선순위: date 타입 속성(완료일/날짜) → last_edited_time → 현재 시각
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getPageDoneAt(page: any): string {
  const props = page.properties ?? {}

  // 1) date 타입 속성 탐색 — "완료일", "날짜", "Done Date", "Date" 등
  const DATE_PROP_NAMES = ['완료일', '날짜', 'done date', 'date', 'completed', 'completion date']
  for (const [key, prop] of Object.entries(props) as [string, any][]) {
    if (prop.type === 'date' && prop.date?.start) {
      // 이름이 완료일 관련이면 우선 사용
      if (DATE_PROP_NAMES.some(n => key.toLowerCase().includes(n))) {
        return new Date(prop.date.start).toISOString()
      }
    }
  }
  // 이름 무관하게 date 속성이 하나라도 있으면 사용
  for (const prop of Object.values(props) as any[]) {
    if (prop.type === 'date' && prop.date?.start) {
      return new Date(prop.date.start).toISOString()
    }
  }

  // 2) 페이지 최종 수정 시각 (완료 처리 시점과 가장 가까운 값)
  if (page.last_edited_time) return page.last_edited_time

  // 3) 최후 fallback
  return new Date().toISOString()
}

// 데이터베이스의 모든 페이지 가져오기
async function queryDatabase(apiKey: string, databaseId: string) {
  const pages: any[] = [] // eslint-disable-line @typescript-eslint/no-explicit-any
  let cursor: string | undefined

  do {
    const body: Record<string, unknown> = { page_size: 100 }
    if (cursor) body.start_cursor = cursor

    const res = await fetch(`${NOTION_API}/databases/${databaseId}/query`, {
      method: 'POST',
      headers: notionHeaders(apiKey),
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.message ?? `Notion API 오류 (${res.status})`)
    }

    const data = await res.json()
    pages.push(...data.results)
    cursor = data.next_cursor ?? undefined
  } while (cursor)

  return pages
}

// 블록 자식 목록 가져오기
async function getBlockChildren(apiKey: string, blockId: string) {
  const blocks: any[] = [] // eslint-disable-line @typescript-eslint/no-explicit-any
  let cursor: string | undefined

  do {
    const url = new URL(`${NOTION_API}/blocks/${blockId}/children`)
    url.searchParams.set('page_size', '100')
    if (cursor) url.searchParams.set('start_cursor', cursor)

    const res = await fetch(url.toString(), { headers: notionHeaders(apiKey) })
    if (!res.ok) break

    const data = await res.json()
    blocks.push(...data.results)
    cursor = data.next_cursor ?? undefined
  } while (cursor)

  return blocks
}

// 블록 항목 타입
interface BlockEntry {
  type: 'todo' | 'bullet' | 'ordered' | 'text' | 'code'
  text: string
  checked?: boolean
  depth: number
  prefix?: string   // 헤딩 레벨 표시용 ("# ", "## " 등)
}

// 블록 재귀 수집 — 노션의 모든 텍스트 블록 포함
async function collectBlocks(apiKey: string, blockId: string, depth: number): Promise<BlockEntry[]> {
  const result: BlockEntry[] = []
  const blocks = await getBlockChildren(apiKey, blockId)

  for (const block of blocks) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = block as any
    switch (b.type) {
      case 'to_do': {
        const text = richTextToPlain(b.to_do.rich_text)
        result.push({ type: 'todo', text, checked: b.to_do.checked, depth })
        if (b.has_children) result.push(...await collectBlocks(apiKey, b.id, depth + 1))
        break
      }
      case 'bulleted_list_item': {
        const text = richTextToPlain(b.bulleted_list_item.rich_text)
        if (text.trim()) result.push({ type: 'bullet', text, depth })
        if (b.has_children) result.push(...await collectBlocks(apiKey, b.id, depth + 1))
        break
      }
      case 'numbered_list_item': {
        const text = richTextToPlain(b.numbered_list_item.rich_text)
        if (text.trim()) result.push({ type: 'ordered', text, depth })
        if (b.has_children) result.push(...await collectBlocks(apiKey, b.id, depth + 1))
        break
      }
      case 'paragraph': {
        const text = richTextToPlain(b.paragraph.rich_text)
        if (text.trim()) result.push({ type: 'text', text, depth: 0 })
        if (b.has_children) result.push(...await collectBlocks(apiKey, b.id, depth + 1))
        break
      }
      case 'heading_1': {
        const text = richTextToPlain(b.heading_1.rich_text)
        if (text.trim()) result.push({ type: 'text', text, depth: 0, prefix: '# ' })
        if (b.has_children) result.push(...await collectBlocks(apiKey, b.id, depth + 1))
        break
      }
      case 'heading_2': {
        const text = richTextToPlain(b.heading_2.rich_text)
        if (text.trim()) result.push({ type: 'text', text, depth: 0, prefix: '## ' })
        if (b.has_children) result.push(...await collectBlocks(apiKey, b.id, depth + 1))
        break
      }
      case 'heading_3': {
        const text = richTextToPlain(b.heading_3.rich_text)
        if (text.trim()) result.push({ type: 'text', text, depth: 0, prefix: '### ' })
        if (b.has_children) result.push(...await collectBlocks(apiKey, b.id, depth + 1))
        break
      }
      case 'quote': {
        const text = richTextToPlain(b.quote.rich_text)
        if (text.trim()) result.push({ type: 'text', text, depth: 0, prefix: '❝ ' })
        if (b.has_children) result.push(...await collectBlocks(apiKey, b.id, depth + 1))
        break
      }
      case 'callout': {
        const text = richTextToPlain(b.callout.rich_text)
        const emoji = b.callout?.icon?.emoji ?? '💡'
        if (text.trim()) result.push({ type: 'text', text, depth: 0, prefix: `${emoji} ` })
        if (b.has_children) result.push(...await collectBlocks(apiKey, b.id, depth + 1))
        break
      }
      case 'code': {
        // 코드 블록 — 언어 표시 + 전체 코드 텍스트
        const code = richTextToPlain(b.code.rich_text)
        const lang = b.code?.language ?? ''
        if (code.trim()) result.push({ type: 'code', text: code, depth: 0, prefix: lang || 'code' })
        break
      }
      case 'divider': {
        // 구분선 → 빈 줄로 표현
        result.push({ type: 'text', text: '──────────', depth: 0 })
        break
      }
      case 'toggle': {
        // 토글 블록 — 제목 텍스트 + 자식 내용
        const text = richTextToPlain(b.toggle.rich_text)
        if (text.trim()) result.push({ type: 'text', text, depth: 0, prefix: '▶ ' })
        if (b.has_children) result.push(...await collectBlocks(apiKey, b.id, depth + 1))
        break
      }
      case 'column_list':
      case 'column': {
        // 컬럼 레이아웃 — 자식 재귀
        if (b.has_children) result.push(...await collectBlocks(apiKey, b.id, depth))
        break
      }
      case 'table': {
        // 테이블 — 행(table_row)을 자식으로 재귀
        if (b.has_children) result.push(...await collectBlocks(apiKey, b.id, depth))
        break
      }
      case 'table_row': {
        // 테이블 행 — 각 셀을 " | "로 연결
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cells: any[][] = b.table_row?.cells ?? []
        const row = cells.map((cell: any[]) => richTextToPlain(cell)).join(' | ')
        if (row.trim()) result.push({ type: 'text', text: row, depth })
        break
      }
      case 'child_page': {
        // 하위 페이지 링크 — 제목만 표시
        const text = b.child_page?.title ?? ''
        if (text) result.push({ type: 'text', text, depth, prefix: '📄 ' })
        break
      }
      case 'synced_block': {
        // 동기화 블록 — 원본 자식 재귀
        if (b.has_children) result.push(...await collectBlocks(apiKey, b.id, depth))
        break
      }
      case 'link_to_page': {
        // 페이지 링크 — 텍스트 표현 불가, 건너뜀
        break
      }
      // image, video, file, embed, bookmark 등은 캡션만 가져옴
      case 'image':
      case 'video':
      case 'file':
      case 'embed':
      case 'bookmark': {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const caption = richTextToPlain((b[b.type]?.caption ?? []) as any[])
        if (caption.trim()) result.push({ type: 'text', text: caption, depth: 0, prefix: '🖼 ' })
        break
      }
    }
  }

  return result
}

// BlockEntry[] → { description: Tiptap JSON, note: null }
// to_do / bullet / ordered → taskList/taskItem
// text (paragraph/heading/quote) → 일반 paragraph 노드 (캔버스에서 직접 표시)
// 순서를 보존: text와 액션블록이 섞여 있어도 원래 순서대로 doc 구성
interface TiptapResult {
  description: object | null
  note: string | null
}

function buildTiptapResult(blocks: BlockEntry[]): TiptapResult {
  if (blocks.length === 0) return { description: null, note: null }

  // 액션 블록 그룹 → 재귀 taskList (기존 로직 유지)
  function buildTaskList(items: BlockEntry[], baseDepth: number): object {
    const children: object[] = []
    let i = 0
    while (i < items.length) {
      const item = items[i]
      if (item.depth !== baseDepth) { i++; continue }
      let j = i + 1
      while (j < items.length && items[j].depth > baseDepth) j++
      const subItems = items.slice(i + 1, j)
      const content: object[] = [
        { type: 'paragraph', content: item.text ? [{ type: 'text', text: item.text }] : [] },
      ]
      if (subItems.length > 0) content.push(buildTaskList(subItems, baseDepth + 1))
      const checked = item.type === 'todo' ? (item.checked ?? false) : false
      children.push({ type: 'taskItem', attrs: { checked, checkedAt: null }, content })
      i = j
    }
    return { type: 'taskList', content: children }
  }

  // 블록 순서 보존: text → paragraph, 연속 액션 블록 → taskList 로 그룹핑
  const docContent: object[] = []
  let i = 0

  while (i < blocks.length) {
    const block = blocks[i]

    if (block.type === 'text') {
      // 일반 텍스트 → paragraph 노드 (prefix로 헤딩/인용 구분)
      const displayText = (block.prefix ?? '') + block.text.trim()
      if (displayText.trim()) {
        docContent.push({
          type: 'paragraph',
          content: [{ type: 'text', text: displayText }],
        })
      }
      i++
    } else if (block.type === 'code') {
      // 코드 블록 → paragraph 노드 (언어 레이블 + 코드 내용)
      const lines = block.text.trim().split('\n')
      if (block.prefix) {
        docContent.push({
          type: 'paragraph',
          content: [{ type: 'text', text: `[${block.prefix}]` }],
        })
      }
      lines.forEach(line => {
        docContent.push({
          type: 'paragraph',
          content: line ? [{ type: 'text', text: line }] : [],
        })
      })
      i++
    } else {
      // 연속된 액션 블록(todo/bullet/ordered)을 하나의 taskList로 묶기
      // 'text'와 'code'를 만나면 그룹 종료 (두 타입은 별도 처리)
      const start = i
      while (i < blocks.length && blocks[i].type !== 'text' && blocks[i].type !== 'code') i++
      const actionGroup = blocks.slice(start, i)
      if (actionGroup.length > 0) docContent.push(buildTaskList(actionGroup, 0))
    }
  }

  if (docContent.length === 0) return { description: null, note: null }

  return {
    description: { type: 'doc', content: docContent },
    note: null,  // 텍스트가 description(캔버스)에 포함되므로 별도 note 불필요
  }
}

export async function POST() {
  const apiKey = process.env.NOTION_API_KEY
  const databaseId = process.env.NOTION_DATABASE_ID

  if (!apiKey || !databaseId) {
    return NextResponse.json(
      { error: 'NOTION_API_KEY 또는 NOTION_DATABASE_ID가 설정되지 않았습니다.' },
      { status: 500 },
    )
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  let pages
  try {
    pages = await queryDatabase(apiKey, databaseId)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '알 수 없는 오류'
    return NextResponse.json({ error: `Notion 연결 실패: ${msg}` }, { status: 500 })
  }

  // 기존 항목 조회
  const { data: existingTasks } = await supabase
    .from('tasks').select('id, title, created_at, done_at').eq('user_id', user.id)
  const existingMap = new Map(
    (existingTasks ?? []).map((t: { id: string; title: string; created_at: string; done_at: string | null }) => [t.title, t])
  )

  const imported: string[] = []
  const updated: string[] = []

  for (const page of pages) {
    const title = getPageTitle(page)
    if (!title || title === '(제목 없음)') continue

    const notionCreatedAt: string = page.created_time ?? new Date().toISOString()
    const is_done = getPageDone(page)
    const is_memory = getPageMemory(page)

    // 블록 수집 (신규·기존 모두) — todo/bullet/ordered → taskItem, text → note
    const blocks = await collectBlocks(apiKey, page.id, 0)
    const { description, note } = buildTiptapResult(blocks)

    const existing = existingMap.get(title)

    if (existing) {
      // 기존 항목: description + note + is_done + is_memory + created_at 재동기화
      // done_at: 완료→미완료면 null, 미완료→완료면 기존 done_at 유지(없으면 노션 완료 시각)
      await supabase.from('tasks').update({
        description,
        note,
        is_done,
        is_memory,
        done_at: is_done ? (existing.done_at ?? getPageDoneAt(page)) : null,
        created_at: notionCreatedAt,
      }).eq('id', existing.id)
      updated.push(title)
      continue
    }

    // 신규 항목 삽입 — done_at을 노션 완료 시각으로 설정
    const { error } = await supabase.from('tasks').insert({
      title,
      description,
      note,
      is_done,
      is_memory,
      done_at: is_done ? getPageDoneAt(page) : null,
      user_id: user.id,
      created_at: notionCreatedAt,
    })

    if (!error) {
      imported.push(title)
      existingMap.set(title, { id: '', title, created_at: notionCreatedAt, done_at: null })
    }
  }

  return NextResponse.json({ imported, updated, count: imported.length })
}
