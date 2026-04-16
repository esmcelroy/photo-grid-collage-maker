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
 * Converts oklch() / oklab() values in a CSS string to rgb() equivalents
 * using a temporary DOM element and the browser's computed style engine.
 * Falls back to the original value if the browser can't parse it (e.g. jsdom).
 */
export function convertModernColors(value: string): string {
  if (!value || (!value.includes('oklch') && !value.includes('oklab'))) {
    return value
  }

  try {
    const el = document.createElement('div')
    el.style.color = value
    document.body.appendChild(el)
    const computed = getComputedStyle(el).color
    document.body.removeChild(el)
    // If the browser understood the color, computed will be in rgb() format
    if (computed && !computed.includes('oklch') && !computed.includes('oklab')) {
      return computed
    }
  } catch {
    // ignore — fall through to original value
  }
  return value
}

/**
 * Walks the subtree of `root` and converts any inline oklch/oklab color
 * values to rgb so html2canvas can parse them. Returns a cleanup function
 * that restores the original inline styles.
 */
export function replaceOklchInSubtree(root: HTMLElement): () => void {
  const restoreFns: Array<() => void> = []

  const elements = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))]
  for (const el of elements) {
    const inlineStyle = el.getAttribute('style') || ''
    if (inlineStyle.includes('oklch') || inlineStyle.includes('oklab')) {
      const originalStyle = inlineStyle
      const converted = inlineStyle.replace(
        /oklch\([^)]+\)|oklab\([^)]+\)/g,
        (match) => convertModernColors(match)
      )
      if (converted !== originalStyle) {
        el.setAttribute('style', converted)
        restoreFns.push(() => el.setAttribute('style', originalStyle))
      }
    }
  }

  return () => restoreFns.forEach((fn) => fn())
}

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
      onclone: (_doc: Document, clonedEl: HTMLElement) => {
        // html2canvas clones the DOM — convert colors in the clone too
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
