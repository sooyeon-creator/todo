// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractText(node: any): string {
  if (!node) return ''
  if (node.type === 'text') return node.text ?? ''
  if (node.content) return node.content.map(extractText).join(' ')
  return ''
}

const CATEGORIES: { keywords: string[]; messages: (n: number) => string[] }[] = [
  {
    keywords: ['청소', '빨래', '설거지', '요리', '집안일', '청소기', '걸레', '정리', '살림', '분리수거', '쓰레기', '세탁', '다림질', '냉장고'],
    messages: n => [
      '오늘의 살림 미션 완료! 티 안 나도, 이 수고로움을 당신은 알잖아요.',
      '집안일 끝! 깨끗해진 공간만큼 마음도 한결 가벼워졌을 거예요.',
      n >= 7
        ? `${n}가지 살림을 다 해냈어요! 이 집 살림의 주인공, 진짜 대단합니다.`
        : '살림 완료! 수고했어요, 오늘만큼은 푹 쉬세요.',
    ],
  },
  {
    keywords: ['운동', '헬스', '달리기', '조깅', '산책', '스트레칭', '요가', '필라테스', '홈트', '수영', '자전거', 'pt', '웨이트'],
    messages: n => [
      n >= 6
        ? `${n}가지 운동 루틴 전부 완수! 오늘 몸이 당신에게 감사할 거예요.`
        : '운동 미션 달성! 꾸준한 당신이 진짜 멋집니다.',
      '오늘도 몸을 위한 투자 완료! 이 노력, 분명 돌아옵니다.',
      '운동 끝! 힘들었겠지만 해낸 자신을 칭찬해주세요.',
    ],
  },
  {
    keywords: ['공부', '학습', '수업', '강의', '시험', '과제', '레포트', '논문', '독서', '책', '읽기', '강좌', '인강', '복습', '예습', '단어'],
    messages: n => [
      n >= 8
        ? `${n}개의 학습 항목 완료! 이 집중력, 정말 대단합니다. 배움이 쌓이고 있어요.`
        : '오늘의 학습 완료! 이 시간들이 차곡차곡 미래를 만들어가고 있어요.',
      '공부 끝! 오늘 집중한 당신, 분명 빛날 날이 옵니다.',
      '학습 미션 달성! 힘들었을 텐데 끝까지 해냈네요. 정말 잘했어요.',
    ],
  },
  {
    keywords: ['업무', '회의', '보고서', '발표', '프레젠테이션', '기획', '미팅', '프로젝트', '작업', '마감', '데드라인', '클라이언트', '제안서'],
    messages: n => [
      n >= 8
        ? `${n}가지 업무 전부 처리 완료! 오늘 정말 알차게 일했어요. 퇴근 후 진짜 쉬어도 돼요.`
        : '업무 완료! 오늘 해낸 것들, 정말 대단합니다.',
      '일 다 했다! 이 성취감, 오늘 하루의 진짜 보상이에요.',
      '업무 미션 클리어! 수고 많으셨습니다. 이제 잠시 쉬어도 될 것 같아요.',
    ],
  },
  {
    keywords: ['이사', '짐', '포장', '박스', '정리', '입주', '계약'],
    messages: () => [
      '이사 준비 완료! 새 시작을 위한 수고, 정말 대단해요.',
      '이사 미션 클리어! 힘든 과정 끝에 새 보금자리가 기다리고 있어요.',
    ],
  },
  {
    keywords: ['여행', '패킹', '짐싸기', '예약', '비행기', '호텔', '숙소', '여권', '환전'],
    messages: () => [
      '여행 준비 완료! 이제 설레는 일만 남았어요. 즐거운 여행 되세요!',
      '여행 준비 끝! 꼼꼼하게 다 챙겼으니 이제 마음껏 즐겨요.',
    ],
  },
  {
    keywords: ['쇼핑', '장보기', '마트', '구매', '주문', '장바구니'],
    messages: () => [
      '쇼핑 미션 완료! 빠뜨린 것 없이 다 해냈네요. 현명한 소비였어요.',
      '장보기 끝! 필요한 것들 다 챙기느라 수고했어요.',
    ],
  },
  {
    keywords: ['육아', '아이', '아기', '유치원', '어린이집', '학교', '숙제', '준비물', '도시락'],
    messages: () => [
      '육아 미션 완료! 아이를 위한 오늘 하루, 정말 수고하셨습니다. 최고의 부모님이에요.',
      '아이를 위한 모든 준비 끝! 이 헌신, 아이는 분명 느끼고 있을 거예요.',
    ],
  },
  {
    keywords: ['요리', '레시피', '재료', '식단', '밀프렙', '도시락'],
    messages: () => [
      '오늘의 요리 미션 완료! 정성 가득한 음식, 드시는 분이 행복할 거예요.',
      '요리 끝! 먹는 즐거움을 만들어내는 일, 정말 멋진 일이에요.',
    ],
  },
  {
    keywords: ['개발', '코딩', '코드', '버그', '기능', '배포', '테스트', '리뷰', '커밋', 'pr', 'api'],
    messages: n => [
      n >= 8
        ? `${n}가지 개발 작업 전부 완료! 이 집중력과 끈기, 진짜 대단합니다.`
        : '개발 미션 클리어! 코드와 씨름하며 해낸 오늘, 수고 많았어요.',
      '구현 완료! 복잡한 것들을 하나하나 해결해낸 당신, 정말 멋져요.',
    ],
  },
  {
    keywords: ['디자인', '시안', '편집', '그래픽', '일러스트', '포토샵', '피그마'],
    messages: () => [
      '디자인 작업 완료! 아름다운 결과물 위해 수고한 시간들, 충분히 빛날 거예요.',
      '크리에이티브 미션 끝! 감각적인 작업, 정말 잘 해냈어요.',
    ],
  },
]

const LONG_MESSAGES = (n: number): string[] => [
  `${n}개 항목 전부 완료! 긴 여정을 끝까지 해낸 당신, 정말 대단합니다. 충분히 뿌듯해해도 돼요.`,
  `무려 ${n}가지를 다 해냈어요! 이 긴 목록을 포기하지 않은 끈기, 진심으로 박수를 보냅니다.`,
  `${n}개 완전 클리어! 한 번에 이만큼을 해내다니, 오늘 정말 잘 해냈어요.`,
]

const MEDIUM_MESSAGES = (n: number): string[] => [
  `${n}가지 할 일 전부 완료! 착실하게 다 해냈네요. 오늘 정말 알차게 보냈어요.`,
  `${n}개 모두 클리어! 하나하나 꼼꼼하게 해낸 당신, 수고했어요.`,
]

const SHORT_MESSAGES: string[] = [
  '깔끔하게 완료! 빠르고 완벽하게 해냈어요.',
  '미션 클리어! 시작했으니 끝낸 거잖아요 — 정말 잘했어요.',
  '전부 완료! 작은 성취도 쌓이면 큰 변화가 됩니다. 잘 해냈어요.',
]

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export function getCelebrationMessage(title: string, description: object | null, totalItems: number): string {
  const allText = `${title} ${description ? extractText(description) : ''}`.toLowerCase()

  for (const cat of CATEGORIES) {
    if (cat.keywords.some(kw => allText.includes(kw))) {
      return pick(cat.messages(totalItems))
    }
  }

  if (totalItems >= 10) return pick(LONG_MESSAGES(totalItems))
  if (totalItems >= 5) return pick(MEDIUM_MESSAGES(totalItems))
  if (totalItems > 0) return pick(SHORT_MESSAGES)
  return '모두 완료! 정말 수고하셨습니다.'
}
