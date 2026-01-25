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

export async function downloadCollage(
  canvasElement: HTMLElement,
  filename: string = 'collage.png'
): Promise<void> {
  const html2canvas = (await import('html2canvas')).default
  
  const canvas = await html2canvas(canvasElement, {
    scale: 3,
    useCORS: true,
    allowTaint: true,
    backgroundColor: null,
    logging: false,
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
