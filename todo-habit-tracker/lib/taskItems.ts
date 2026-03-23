export interface SubtaskItem {
  text: string
  checked: boolean
  depth: number
  checkedAt?: string  // ISO string — 체크한 날짜
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function nodeText(node: any): string {
  if (node.type === 'text') return node.text ?? ''
  if (node.content) return (node.content as any[]).map(nodeText).join('')
  return ''
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function traverse(node: any, depth: number, out: SubtaskItem[]): void {
  if (node.type === 'taskItem') {
    // Extract text from non-taskList children only
    let text = ''
    ;(node.content ?? []).forEach((child: any) => {
      if (child.type !== 'taskList') text += nodeText(child)
    })
    if (text.trim()) {
      out.push({
        text: text.trim(),
        checked: !!node.attrs?.checked,
        depth,
        checkedAt: node.attrs?.checkedAt ?? undefined,
      })
    }
    // Recurse into nested taskList
    ;(node.content ?? []).forEach((child: any) => {
      if (child.type === 'taskList') {
        ;(child.content ?? []).forEach((item: any) => traverse(item, depth + 1, out))
      }
    })
  } else {
    ;(node.content ?? []).forEach((child: any) => traverse(child, depth, out))
  }
}

export function getSubtaskItems(description: unknown): SubtaskItem[] {
  if (!description || typeof description !== 'object') return []
  const out: SubtaskItem[] = []
  traverse(description, 0, out)
  return out
}

// targetIndex번째 항목의 텍스트를 newText로 교체
export function renameSubtaskItem(description: unknown, targetIndex: number, newText: string): unknown {
  if (!description || typeof description !== 'object') return description
  let visitIndex = 0

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function visit(node: any): any {
    if (node.type === 'taskItem') {
      let text = ''
      ;(node.content ?? []).forEach((child: any) => {
        if (child.type !== 'taskList') text += nodeText(child)
      })

      let newNode = node
      if (text.trim()) {
        if (visitIndex === targetIndex) {
          const newContent = (node.content ?? []).map((child: any) => {
            if (child.type === 'taskList') return child
            return { type: 'paragraph', content: [{ type: 'text', text: newText }] }
          })
          newNode = { ...node, content: newContent }
        }
        visitIndex++
      }

      if (newNode.content) {
        return { ...newNode, content: (newNode.content as any[]).map(visit) }
      }
      return newNode
    }

    if (node.content) {
      return { ...node, content: (node.content as any[]).map(visit) }
    }
    return node
  }

  return visit(description)
}

// targetIndex번째 항목 다음에 새 항목을 삽입 (같은 depth 형제)
export function addSubtaskAfter(description: unknown, targetIndex: number, newText: string): unknown {
  if (!description || typeof description !== 'object') return description
  let visitIndex = 0
  let inserted = false

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function visitTaskList(listNode: any): any {
    const newContent: any[] = []
    for (const child of (listNode.content ?? [])) {
      if (child.type !== 'taskItem') {
        newContent.push(visitNode(child))
        continue
      }
      let text = ''
      ;(child.content ?? []).forEach((c: any) => {
        if (c.type !== 'taskList') text += nodeText(c)
      })
      const hasText = !!text.trim()
      const thisIndex = hasText ? visitIndex : -1
      if (hasText) visitIndex++
      newContent.push(visitNode(child))
      if (!inserted && hasText && thisIndex === targetIndex) {
        inserted = true
        newContent.push({
          type: 'taskItem',
          attrs: { checked: false },
          content: [{ type: 'paragraph', content: newText ? [{ type: 'text', text: newText }] : [] }],
        })
      }
    }
    return { ...listNode, content: newContent }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function visitNode(node: any): any {
    if (node.type === 'taskList') return visitTaskList(node)
    if (node.content) return { ...node, content: (node.content as any[]).map(visitNode) }
    return node
  }

  return visitNode(description)
}

// targetIndex번째 항목을 삭제 (하위 자식도 함께 제거)
export function deleteSubtaskItem(description: unknown, targetIndex: number): unknown {
  if (!description || typeof description !== 'object') return description
  let visitIndex = 0

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function visitTaskList(listNode: any): any {
    const newContent: any[] = []
    for (const child of (listNode.content ?? [])) {
      if (child.type !== 'taskItem') {
        newContent.push(visitNode(child))
        continue
      }
      let text = ''
      ;(child.content ?? []).forEach((c: any) => {
        if (c.type !== 'taskList') text += nodeText(c)
      })
      const hasText = !!text.trim()
      const thisIndex = hasText ? visitIndex : -1
      if (hasText) visitIndex++
      if (hasText && thisIndex === targetIndex) continue  // 이 항목 삭제
      newContent.push(visitNode(child))
    }
    return { ...listNode, content: newContent }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function visitNode(node: any): any {
    if (node.type === 'taskList') return visitTaskList(node)
    if (node.content) return { ...node, content: (node.content as any[]).map(visitNode) }
    return node
  }

  return visitNode(description)
}

// getSubtaskItems와 동일한 순서로 순회하여 targetIndex번째 항목의 checked를 토글
// 체크 시 checkedAt(ISO) 저장, 체크 해제 시 제거
export function toggleSubtaskChecked(description: unknown, targetIndex: number, noDate = false): unknown {
  if (!description || typeof description !== 'object') return description
  let visitIndex = 0

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function visit(node: any): any {
    if (node.type === 'taskItem') {
      let text = ''
      ;(node.content ?? []).forEach((child: any) => {
        if (child.type !== 'taskList') text += nodeText(child)
      })

      let newNode = node
      if (text.trim()) {
        if (visitIndex === targetIndex) {
          const nowChecked = !node.attrs?.checked
          const { checkedAt: _removed, ...restAttrs } = node.attrs ?? {}
          newNode = {
            ...node,
            attrs: {
              ...restAttrs,
              checked: nowChecked,
              ...(nowChecked && !noDate ? { checkedAt: new Date().toISOString() } : {}),
            },
          }
        }
        visitIndex++
      }

      if (newNode.content) {
        return { ...newNode, content: (newNode.content as any[]).map(visit) }
      }
      return newNode
    }

    if (node.content) {
      return { ...node, content: (node.content as any[]).map(visit) }
    }
    return node
  }

  return visit(description)
}

// targetIndex번째 항목의 checkedAt만 업데이트 (null이면 제거)
export function setSubtaskCheckedAt(description: unknown, targetIndex: number, checkedAt: string | null): unknown {
  if (!description || typeof description !== 'object') return description
  let visitIndex = 0

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function visit(node: any): any {
    if (node.type === 'taskItem') {
      let text = ''
      ;(node.content ?? []).forEach((child: any) => {
        if (child.type !== 'taskList') text += nodeText(child)
      })

      let newNode = node
      if (text.trim()) {
        if (visitIndex === targetIndex) {
          const { checkedAt: _removed, ...restAttrs } = node.attrs ?? {}
          newNode = {
            ...node,
            attrs: {
              ...restAttrs,
              ...(checkedAt ? { checkedAt } : {}),
            },
          }
        }
        visitIndex++
      }

      if (newNode.content) {
        return { ...newNode, content: (newNode.content as any[]).map(visit) }
      }
      return newNode
    }

    if (node.content) {
      return { ...node, content: (node.content as any[]).map(visit) }
    }
    return node
  }

  return visit(description)
}
