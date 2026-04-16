import '@testing-library/jest-dom/jest-globals'
import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PhotoEditDialog } from '@/components/PhotoEditDialog'
import type { PhotoPosition, UploadedPhoto } from '@/lib/types'

// ─── fixtures ─────────────────────────────────────────────────────────────────

const photo: UploadedPhoto = {
  id: 'p1',
  file: new File([''], 'photo.jpg', { type: 'image/jpeg' }),
  dataUrl: 'data:image/jpeg;base64,test',
}

const makePosition = (overrides?: Partial<PhotoPosition>): PhotoPosition => ({
  photoId: 'p1',
  gridArea: 'a',
  ...overrides,
})

// ─── helpers ──────────────────────────────────────────────────────────────────

function renderDialog(overrides?: {
  onApply?: jest.Mock
  position?: PhotoPosition
  open?: boolean
}) {
  const onApply = overrides?.onApply ?? jest.fn()
  const onOpenChange = jest.fn()
  const result = render(
    <PhotoEditDialog
      open={overrides?.open ?? true}
      onOpenChange={onOpenChange}
      photo={photo}
      position={overrides?.position ?? makePosition()}
      onApply={onApply}
    />
  )
  return { ...result, onApply, onOpenChange }
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe('PhotoEditDialog', () => {
  it('renders the dialog with Edit Photo title', async () => {
    renderDialog()
    expect(await screen.findByText('Edit Photo')).toBeInTheDocument()
  })

  it('renders a preview image', async () => {
    renderDialog()
    const img = await screen.findByAltText('Preview')
    expect(img).toHaveAttribute('src', photo.dataUrl)
  })

  it('shows rotation at 0° by default', async () => {
    renderDialog()
    expect(await screen.findByText('0°')).toBeInTheDocument()
  })

  it('rotates 90° clockwise when CW button is clicked', async () => {
    renderDialog()
    const cwButton = await screen.findByLabelText('Rotate clockwise')
    fireEvent.click(cwButton)
    expect(screen.getByText('90°')).toBeInTheDocument()
  })

  it('rotates counter-clockwise', async () => {
    renderDialog({ position: makePosition({ rotation: 90 }) })
    const ccwButton = await screen.findByLabelText('Rotate counter-clockwise')
    fireEvent.click(ccwButton)
    expect(screen.getByText('0°')).toBeInTheDocument()
  })

  it('wraps rotation around 360', async () => {
    renderDialog({ position: makePosition({ rotation: 270 }) })
    const cwButton = await screen.findByLabelText('Rotate clockwise')
    fireEvent.click(cwButton)
    expect(screen.getByText('0°')).toBeInTheDocument()
  })

  it('shows zoom at 100% by default', async () => {
    renderDialog()
    expect(await screen.findByText('100%')).toBeInTheDocument()
  })

  it('shows existing position values', async () => {
    renderDialog({
      position: makePosition({ rotation: 180, scale: 1.5, objectPosition: '30% 70%' }),
    })
    expect(await screen.findByText('180°')).toBeInTheDocument()
    expect(screen.getByText('150%')).toBeInTheDocument()
    expect(screen.getByText('30%')).toBeInTheDocument()
    expect(screen.getByText('70%')).toBeInTheDocument()
  })

  it('calls onApply with updated position on Apply click', async () => {
    const { onApply } = renderDialog()
    // Rotate clockwise twice → 180°
    const cwButton = await screen.findByLabelText('Rotate clockwise')
    fireEvent.click(cwButton)
    fireEvent.click(cwButton)

    const applyBtn = screen.getByRole('button', { name: /apply/i })
    fireEvent.click(applyBtn)

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        photoId: 'p1',
        gridArea: 'a',
        rotation: 180,
      })
    )
  })

  it('strips default values from applied position', async () => {
    const { onApply } = renderDialog()
    // No changes — should strip defaults
    const applyBtn = await screen.findByRole('button', { name: /apply/i })
    fireEvent.click(applyBtn)

    const result = onApply.mock.calls[0][0] as PhotoPosition
    expect(result.rotation).toBeUndefined()
    expect(result.scale).toBeUndefined()
    expect(result.objectPosition).toBeUndefined()
  })

  it('resets all values when Reset is clicked', async () => {
    renderDialog({
      position: makePosition({ rotation: 90, scale: 2 }),
    })

    const resetBtn = await screen.findByRole('button', { name: /reset/i })
    fireEvent.click(resetBtn)

    expect(screen.getByText('0°')).toBeInTheDocument()
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('calls onOpenChange(false) on Cancel', async () => {
    const { onOpenChange } = renderDialog()
    const cancelBtn = await screen.findByRole('button', { name: /cancel/i })
    fireEvent.click(cancelBtn)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('closes after Apply', async () => {
    const { onOpenChange } = renderDialog()
    const applyBtn = await screen.findByRole('button', { name: /apply/i })
    fireEvent.click(applyBtn)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
