'use client'

import { useState, useEffect } from 'react'
import { Settings, X, ExternalLink } from 'lucide-react'

const STORAGE_KEY = 'google_calendar_embed_url'

export default function GoogleCalendarTab({ isMobile = false }: { isMobile?: boolean }) {
  const [embedUrl, setEmbedUrl] = useState<string | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) setEmbedUrl(saved)
  }, [])

  function validate(url: string): boolean {
    return url.includes('calendar.google.com')
  }

  function handleSave() {
    const trimmed = inputValue.trim()
    if (!trimmed) { setError('URL을 입력해주세요.'); return }
    if (!validate(trimmed)) { setError('구글 캘린더 임베드 URL이 아닙니다.'); return }
    localStorage.setItem(STORAGE_KEY, trimmed)
    setEmbedUrl(trimmed)
    setShowSettings(false)
    setError('')
  }

  function handleRemove() {
    localStorage.removeItem(STORAGE_KEY)
    setEmbedUrl(null)
    setInputValue('')
    setShowSettings(false)
  }

  const font = "'Toss Product Sans', 'Pretendard Variable', Pretendard, sans-serif"

  // ── 설정 패널 ──────────────────────────────────────────────────
  if (!embedUrl || showSettings) {
    return (
      <div style={{ padding: isMobile ? '16px 0 80px' : '32px 0 80px', maxWidth: 560, margin: '0 auto' }}>
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e3e2e0', overflow: 'hidden' }}>
          {/* 헤더 */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 18px', background: '#f7f6f3', borderBottom: '1px solid #eeede9',
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#37352f', fontFamily: font }}>
              구글 캘린더 설정
            </span>
            {showSettings && (
              <button
                onClick={() => { setShowSettings(false); setError('') }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9b9a97', display: 'flex' }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* 안내 */}
          <div style={{ padding: '20px 18px' }}>
            <div style={{ fontSize: 13, color: '#37352f', fontFamily: font, marginBottom: 16, lineHeight: 1.7 }}>
              구글 캘린더 임베드 URL을 붙여넣으면 이 탭에 캘린더가 표시됩니다.
            </div>

            <div style={{
              background: '#f7f6f3', borderRadius: 8, padding: '14px 16px',
              marginBottom: 20, fontSize: 12, color: '#6b6a68', fontFamily: font, lineHeight: 1.8,
            }}>
              <div style={{ fontWeight: 600, color: '#37352f', marginBottom: 6 }}>임베드 URL 얻는 방법</div>
              <div>1. 구글 캘린더 웹사이트에서 설정(⚙️)으로 이동</div>
              <div>2. 원하는 캘린더 선택 → <b>캘린더 설정</b></div>
              <div>3. 페이지 하단 <b>"이 캘린더 임베드하기"</b> 섹션</div>
              <div>4. <b>"맞춤설정 및 퍼가기 코드 복사"</b> 클릭</div>
              <div>5. <code style={{ background: '#eeede9', padding: '1px 4px', borderRadius: 3 }}>src="..."</code> 안의 URL만 붙여넣기</div>
            </div>

            <a
              href="https://calendar.google.com/calendar/r/settings"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: 12, color: '#5b5bd6', fontFamily: font,
                textDecoration: 'none', marginBottom: 20,
              }}
            >
              <ExternalLink size={12} /> 구글 캘린더 설정 열기
            </a>

            <div style={{ marginBottom: 12 }}>
              <input
                type="text"
                value={inputValue}
                onChange={e => { setInputValue(e.target.value); setError('') }}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                placeholder="https://calendar.google.com/calendar/embed?src=..."
                style={{
                  width: '100%', fontSize: 12, color: '#37352f',
                  border: `1px solid ${error ? '#ef4444' : '#e3e2e0'}`,
                  borderRadius: 8, padding: '9px 12px', outline: 'none',
                  fontFamily: font, boxSizing: 'border-box',
                }}
                onFocus={e => { if (!error) e.currentTarget.style.borderColor = '#a8a5ff' }}
                onBlur={e => { if (!error) e.currentTarget.style.borderColor = '#e3e2e0' }}
                autoFocus
              />
              {error && (
                <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4, fontFamily: font }}>{error}</div>
              )}
            </div>

            <button
              onClick={handleSave}
              style={{
                width: '100%', padding: '9px 0', borderRadius: 8,
                background: '#37352f', color: 'white', border: 'none',
                fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: font,
              }}
            >
              저장
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── 임베드 뷰 ──────────────────────────────────────────────────
  return (
    <div style={{ paddingBottom: 80 }}>
      {/* 상단 도구 행 */}
      <div style={{
        display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
        paddingTop: 12, paddingBottom: 10, gap: 8,
      }}>
        <button
          onClick={() => { setInputValue(embedUrl); setShowSettings(true) }}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 11, color: '#9b9a97', background: 'none',
            border: '1px solid #e3e2e0', borderRadius: 6,
            padding: '4px 10px', cursor: 'pointer', fontFamily: font,
          }}
        >
          <Settings size={11} /> 설정
        </button>
        <button
          onClick={handleRemove}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 11, color: '#9b9a97', background: 'none',
            border: '1px solid #e3e2e0', borderRadius: 6,
            padding: '4px 10px', cursor: 'pointer', fontFamily: font,
          }}
        >
          <X size={11} /> 연결 해제
        </button>
      </div>

      <iframe
        src={embedUrl}
        style={{
          width: '100%',
          height: isMobile ? 'calc(100vh - 220px)' : 'calc(100vh - 200px)',
          border: 'none',
          borderRadius: 10,
          display: 'block',
        }}
        title="Google Calendar"
      />
    </div>
  )
}
