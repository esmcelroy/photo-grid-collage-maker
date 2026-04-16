export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function generateUniqueId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Converts oklch() / oklab() values in a CSS string to rgb() equivalents.
 * Uses a 1×1 canvas to force the browser to rasterize the color, which
 * always produces sRGB pixel data regardless of input color space.
 * Falls back to the original value if conversion fails (e.g. jsdom).
 */
export function convertModernColors(value: string): string {
  if (!value || (!value.includes('oklch') && !value.includes('oklab'))) {
    return value
  }

  try {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const ctx = canvas.getContext('2d')
    if (!ctx) return value

    // Clear to transparent then fill with the color
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = value
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data

    /* istanbul ignore next -- jsdom canvas stub returns 0,0,0,0; real conversion tested in browser */
    if (a === 255) {
      return `rgb(${r}, ${g}, ${b})`
    }
    /* istanbul ignore next */
    return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`
  } catch {
    // ignore — fall through to original value (e.g. jsdom has no canvas)
  }
  return value
}

// CSS properties that can contain color values resolved from Tailwind oklch vars
const COLOR_PROPS = [
  'color', 'background-color', 'border-color',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'outline-color', 'text-decoration-color', 'caret-color',
  'box-shadow', 'text-shadow',
] as const

/**
 * Overrides CSS custom properties that contain oklch/oklab values on the
 * document root element with rgb equivalents. html2canvas parses stylesheets
 * and custom properties, so we must convert at the variable level.
 * Returns a cleanup function that removes the overrides.
 */
export function replaceOklchCustomProperties(root: HTMLElement): () => void {
  const restoreFns: Array<() => void> = []
  const docEl = root.ownerDocument.documentElement
  const computed = getComputedStyle(docEl)

  // Iterate all CSS custom properties (--*) on :root
  for (let i = 0; i < computed.length; i++) {
    const prop = computed[i]
    if (!prop.startsWith('--')) continue
    const val = computed.getPropertyValue(prop).trim()
    if (val.includes('oklch') || val.includes('oklab')) {
      const converted = val.replace(
        /oklch\([^)]+\)|oklab\([^)]+\)/g,
        (match) => convertModernColors(match)
      )
      if (converted !== val) {
        /* istanbul ignore next -- only reached when canvas converts oklch→rgb (real browser) */
        const prev = docEl.style.getPropertyValue(prop)
        docEl.style.setProperty(prop, converted)
        restoreFns.push(() => {
          if (prev) docEl.style.setProperty(prop, prev)
          else docEl.style.removeProperty(prop)
        })
      }
    }
  }

  return () => restoreFns.forEach((fn) => fn())
}

/**
 * Walks the subtree of `root` and overrides any computed or inline oklch/oklab
 * color values with rgb equivalents so html2canvas can parse them.
 * Also converts CSS custom properties on :root that contain oklch.
 * Returns a cleanup function that restores everything.
 */
export function replaceOklchInSubtree(root: HTMLElement): () => void {
  const restoreFns: Array<() => void> = []

  // Convert CSS custom properties on :root first
  const restoreVars = replaceOklchCustomProperties(root)
  restoreFns.push(restoreVars)

  const elements = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))]
  for (const el of elements) {
    // Handle computed styles (Tailwind classes → CSS vars → oklch)
    const computed = getComputedStyle(el)
    for (const prop of COLOR_PROPS) {
      const val = computed.getPropertyValue(prop)
      if (val && (val.includes('oklch') || val.includes('oklab'))) {
        const converted = convertModernColors(val)
        /* istanbul ignore next -- only reached when canvas converts oklch→rgb (real browser) */
        if (converted !== val) {
          const prev = el.style.getPropertyValue(prop)
          el.style.setProperty(prop, converted)
          restoreFns.push(() => {
            if (prev) el.style.setProperty(prop, prev)
            else el.style.removeProperty(prop)
          })
        }
      }
    }

    // Handle inline style attribute strings with oklch
    const inlineStyle = el.getAttribute('style') || ''
    if (inlineStyle.includes('oklch') || inlineStyle.includes('oklab')) {
      const originalStyle = inlineStyle
      const converted = inlineStyle.replace(
        /oklch\([^)]+\)|oklab\([^)]+\)/g,
        (match) => convertModernColors(match)
      )
      if (converted !== originalStyle) {
        /* istanbul ignore next -- only reached when canvas converts oklch→rgb (real browser) */
        el.setAttribute('style', converted)
        restoreFns.push(() => el.setAttribute('style', originalStyle))
      }
    }
  }

  return () => restoreFns.forEach((fn) => fn())
}

/* istanbul ignore next -- html2canvas requires a real browser; covered by Playwright e2e */
export async function downloadCollage(
  canvasElement: HTMLElement,
  filename: string = 'collage.png'
): Promise<void> {
  const html2canvas = (await import('html2canvas')).default

  // Convert oklch/oklab colors before html2canvas processes the DOM
  const restore = replaceOklchInSubtree(canvasElement)

  try {
    const canvas = await html2canvas(canvasElement, {
      scale: 3,
      useCORS: true,
      allowTaint: true,
      backgroundColor: null,
      logging: false,
      onclone: (clonedDoc: Document, clonedEl: HTMLElement) => {
        // html2canvas clones the entire document — convert CSS custom
        // properties on the cloned :root AND element styles in the clone
        const clonedRoot = clonedDoc.documentElement
        const clonedComputed = clonedDoc.defaultView?.getComputedStyle(clonedRoot)
        if (clonedComputed) {
          for (let i = 0; i < clonedComputed.length; i++) {
            const prop = clonedComputed[i]
            if (!prop.startsWith('--')) continue
            const val = clonedComputed.getPropertyValue(prop).trim()
            if (val.includes('oklch') || val.includes('oklab')) {
              const converted = val.replace(
                /oklch\([^)]+\)|oklab\([^)]+\)/g,
                (match) => convertModernColors(match)
              )
              if (converted !== val) {
                clonedRoot.style.setProperty(prop, converted)
              }
            }
          }
        }
        replaceOklchInSubtree(clonedEl)
      },
    })

    canvas.toBlob((blob) => {
      if (!blob) return

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()

      URL.revokeObjectURL(url)
    }, 'image/png', 1.0)
  } finally {
    restore()
  }
}

export function parseGridTemplate(template: string): {
  rows: string[]
  columns: string[]
} {
  const parts = template.split('/')
  
  if (parts.length === 1) {
    return {
      rows: ['1fr'],
      columns: parts[0].trim().split(' ')
    }
  }
  
  const [rows, cols] = parts
  
  return {
    rows: rows.trim().split(' '),
    columns: cols ? cols.trim().split(' ') : ['1fr']
  }
}

export function parseGridAreas(areas: string[]): string[][] {
  const maxCols = Math.max(...areas.map(area => area.split(' ').length))
  const result: string[][] = []
  
  let currentRow: string[] = []
  let currentArea = ''
  
  for (const area of areas) {
    if (currentArea !== area) {
      if (currentRow.length > 0) {
        result.push(currentRow)
        currentRow = []
      }
      currentArea = area
    }
    currentRow.push(area)
  }
  
  if (currentRow.length > 0) {
    result.push(currentRow)
  }
  
  return result
}
