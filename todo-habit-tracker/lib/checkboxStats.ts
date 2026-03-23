import { CheckboxStats } from '@/types'

// Tiptap JSON에서 taskItem 노드를 재귀적으로 찾아 체크박스 통계 반환
export function getCheckboxStats(doc: object | null): CheckboxStats {
  if (!doc) return { total: 0, checked: 0 }

  let total = 0
  let checked = 0

  function traverse(node: Record<string, unknown>) {
    if (node.type === 'taskItem') {
      total++
      if (node.attrs && (node.attrs as Record<string, unknown>).checked === true) {
        checked++
      }
    }
    const content = node.content as Record<string, unknown>[] | undefined
    if (Array.isArray(content)) {
      content.forEach(traverse)
    }
  }

  traverse(doc as Record<string, unknown>)
  return { total, checked }
}
