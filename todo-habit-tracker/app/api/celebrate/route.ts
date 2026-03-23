import { NextRequest, NextResponse } from 'next/server'
import { getCelebrationMessage } from '@/lib/celebrationMessage'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractText(node: any): string {
  if (!node) return ''
  if (node.type === 'text') return node.text ?? ''
  if (node.content) return (node.content as any[]).map(extractText).join(' ')
  return ''
}

export async function POST(req: NextRequest) {
  const { title, description, totalItems } = await req.json()

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({
      message: getCelebrationMessage(title, description, totalItems),
    })
  }

  const subtaskText = description ? extractText(description) : ''
  const contextText = [title, subtaskText].filter(Boolean).join('. 세부 항목: ')

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic()

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 80,
      messages: [
        {
          role: 'user',
          content: `할 일을 모두 완료했을 때 보여줄 짧은 축하 메시지를 한 문장으로 써줘.

할 일 정보:
- 제목: ${title}
- 세부 항목 수: ${totalItems}개
- 내용 힌트: ${contextText}

규칙:
- 한국어로, 30자 이내
- 제목/내용에서 힌트를 얻어 구체적이고 창의적으로 말을 걸어줘
- 따뜻하고 진심 어린 말투 (격식 없이)
- 텍스트만, 따옴표 없이
- 예: "라면먹기" → 맛있게 드셨나요? 속 든든하겠네요!
- 예: "청소" 8개 → 이 집의 살림왕이시네요! 수고하셨어요.
- 예: "논문" 12개 → 긴 여정 끝! 이 노력, 분명 빛날 거예요.
메시지만 출력해.`,
        },
      ],
    })

    const text =
      msg.content[0].type === 'text'
        ? msg.content[0].text.trim()
        : getCelebrationMessage(title, description, totalItems)

    return NextResponse.json({ message: text })
  } catch {
    return NextResponse.json({
      message: getCelebrationMessage(title, description, totalItems),
    })
  }
}
