'use client'

import { useEffect, useRef, useState } from 'react'
import { getSvgPath } from 'figma-squircle'

export function useSmoothCorners(radius: number, smoothing = 0.6) {
  const ref = useRef<HTMLDivElement>(null)
  const [clipPath, setClipPath] = useState<string>('')

  useEffect(() => {
    const el = ref.current
    if (!el) return

    function update() {
      if (!el) return
      const { width, height } = el.getBoundingClientRect()
      if (width === 0 || height === 0) return
      const path = getSvgPath({ width, height, cornerRadius: radius, cornerSmoothing: smoothing })
      setClipPath(`path('${path}')`)
    }

    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [radius, smoothing])

  return { ref, style: clipPath ? { clipPath } : {} }
}
