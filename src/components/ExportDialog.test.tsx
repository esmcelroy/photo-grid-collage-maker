import '@testing-library/jest-dom/jest-globals'
import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ExportDialog } from '@/components/ExportDialog'

// ─── helpers ──────────────────────────────────────────────────────────────────

function renderDialog(overrides?: { onExport?: jest.Mock; disabled?: boolean }) {
  const onExport = overrides?.onExport ?? jest.fn()
  const result = render(
    <ExportDialog onExport={onExport} disabled={overrides?.disabled} />
  )
  return { ...result, onExport }
}

async function openDialog() {
  const trigger = screen.getByRole('button', { name: /download/i })
  fireEvent.click(trigger)
  await screen.findByText('Export Collage')
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe('ExportDialog', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(1234567890)
  })

  it('renders a Download trigger button', () => {
    renderDialog()
    expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument()
  })

  it('disables the trigger when disabled prop is true', () => {
    renderDialog({ disabled: true })
    expect(screen.getByRole('button', { name: /download/i })).toBeDisabled()
  })

  it('opens dialog on trigger click', async () => {
    renderDialog()
    await openDialog()
    expect(screen.getByText('Export Collage')).toBeInTheDocument()
  })

  it('defaults to PNG format', async () => {
    renderDialog()
    await openDialog()
    const pngRadio = screen.getByLabelText(/png/i) as HTMLInputElement
    expect(pngRadio).toBeChecked()
  })

  it('does not show quality slider for PNG', async () => {
    renderDialog()
    await openDialog()
    expect(screen.queryByLabelText(/jpeg quality/i)).not.toBeInTheDocument()
  })

  it('shows quality slider when JPEG is selected', async () => {
    renderDialog()
    await openDialog()
    const jpegRadio = screen.getByLabelText(/jpeg/i)
    fireEvent.click(jpegRadio)
    expect(screen.getByText('Quality')).toBeInTheDocument()
    expect(screen.getByText('90%')).toBeInTheDocument()
  })

  it('shows estimated size info for JPEG', async () => {
    renderDialog()
    await openDialog()
    const jpegRadio = screen.getByLabelText(/jpeg/i)
    fireEvent.click(jpegRadio)
    expect(screen.getByText(/smaller than PNG/i)).toBeInTheDocument()
  })

  it('shows lossless info for PNG', async () => {
    renderDialog()
    await openDialog()
    expect(screen.getByText(/largest file size/i)).toBeInTheDocument()
  })

  it('pre-fills filename with timestamp', async () => {
    renderDialog()
    await openDialog()
    const input = screen.getByPlaceholderText('collage') as HTMLInputElement
    expect(input.value).toBe('collage-1234567890')
  })

  it('shows .png extension when PNG selected', async () => {
    renderDialog()
    await openDialog()
    expect(screen.getByText('.png')).toBeInTheDocument()
  })

  it('shows .jpg extension when JPEG selected', async () => {
    renderDialog()
    await openDialog()
    const jpegRadio = screen.getByLabelText(/jpeg/i)
    fireEvent.click(jpegRadio)
    expect(screen.getByText('.jpg')).toBeInTheDocument()
  })

  it('calls onExport with PNG options when Export clicked', async () => {
    const { onExport } = renderDialog()
    await openDialog()

    const exportBtn = screen.getByRole('button', { name: /export/i })
    fireEvent.click(exportBtn)

    expect(onExport).toHaveBeenCalledWith({
      format: 'png',
      quality: 1.0,
      filename: 'collage-1234567890.png',
    })
  })

  it('calls onExport with JPEG options at default quality', async () => {
    const { onExport } = renderDialog()
    await openDialog()

    const jpegRadio = screen.getByLabelText(/jpeg/i)
    fireEvent.click(jpegRadio)

    const exportBtn = screen.getByRole('button', { name: /export/i })
    fireEvent.click(exportBtn)

    expect(onExport).toHaveBeenCalledWith({
      format: 'jpeg',
      quality: 0.9,
      filename: 'collage-1234567890.jpg',
    })
  })

  it('allows custom filename', async () => {
    const { onExport } = renderDialog()
    await openDialog()

    const input = screen.getByPlaceholderText('collage') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'my-collage' } })

    const exportBtn = screen.getByRole('button', { name: /export/i })
    fireEvent.click(exportBtn)

    expect(onExport).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'my-collage.png' })
    )
  })

  it('does not duplicate extension if user includes it', async () => {
    const { onExport } = renderDialog()
    await openDialog()

    const input = screen.getByPlaceholderText('collage') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'my-collage.png' } })

    const exportBtn = screen.getByRole('button', { name: /export/i })
    fireEvent.click(exportBtn)

    expect(onExport).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'my-collage.png' })
    )
  })

  it('closes dialog after export', async () => {
    renderDialog()
    await openDialog()

    const exportBtn = screen.getByRole('button', { name: /export/i })
    fireEvent.click(exportBtn)

    await waitFor(() => {
      expect(screen.queryByText('Export Collage')).not.toBeInTheDocument()
    })
  })

  it('closes dialog on Cancel', async () => {
    renderDialog()
    await openDialog()

    const cancelBtn = screen.getByRole('button', { name: /cancel/i })
    fireEvent.click(cancelBtn)

    await waitFor(() => {
      expect(screen.queryByText('Export Collage')).not.toBeInTheDocument()
    })
  })
})
