import { useLayoutEffect, useRef } from 'react'

export function CardTitle({ name }: { name: string }) {
  const title = useRef<HTMLHeadingElement>(null)

  useLayoutEffect(() => {
    const element = title.current
    const card = element?.closest('.trading-card')
    if (!element || !card) return

    let cancelled = false
    function fit() {
      if (cancelled || !element || !element.clientWidth || !element.clientHeight) return
      // Printed cards keep a fixed name box. Try the largest type first, then
      // reduce it only when the natural word breaks exceed that box.
      const max = Math.min(22, element.clientWidth * .068)
      let low = 3
      let high = max
      for (let attempt = 0; attempt < 9; attempt++) {
        const size = (low + high) / 2
        element.style.fontSize = `${size}px`
        if (element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1) low = size
        else high = size
      }
      element.style.fontSize = `${low}px`
    }

    const observer = new ResizeObserver(fit)
    observer.observe(card)
    fit()
    void document.fonts.ready.then(fit)
    return () => { cancelled = true; observer.disconnect() }
  }, [name])

  return <h3 className="card-title" ref={title}>{name}</h3>
}
