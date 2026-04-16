import { jest } from '@jest/globals'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UploadZone } from '@/components/UploadZone'
import { MAX_PHOTOS } from '@/lib/types'

describe('UploadZone', () => {
  it('renders the upload prompt by default', () => {
    render(<UploadZone onFilesSelected={jest.fn()} />)
    expect(screen.getByText(/upload photos/i)).toBeInTheDocument()
  })

  it('calls onFilesSelected when image files are selected via input', async () => {
    const onFilesSelected = jest.fn()
    render(<UploadZone onFilesSelected={onFilesSelected} currentFileCount={0} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['img'], 'photo.jpg', { type: 'image/jpeg' })
    await userEvent.upload(input, file)
    expect(onFilesSelected).toHaveBeenCalledWith([file])
  })

  it('filters out non-image files', async () => {
    const onFilesSelected = jest.fn()
    render(<UploadZone onFilesSelected={onFilesSelected} currentFileCount={0} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const pdf = new File(['data'], 'doc.pdf', { type: 'application/pdf' })
    const jpg = new File(['img'], 'photo.jpg', { type: 'image/jpeg' })
    await userEvent.upload(input, [pdf, jpg])
    expect(onFilesSelected).toHaveBeenCalledWith([jpg])
  })

  it('respects the remaining slot limit', async () => {
    const onFilesSelected = jest.fn()
    render(<UploadZone onFilesSelected={onFilesSelected} currentFileCount={MAX_PHOTOS - 1} maxFiles={MAX_PHOTOS} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const files = [
      new File(['img'], '1.jpg', { type: 'image/jpeg' }),
      new File(['img'], '2.jpg', { type: 'image/jpeg' }),
    ]
    await userEvent.upload(input, files)
    expect(onFilesSelected).toHaveBeenCalledWith([files[0]])
  })

  it('shows max reached message and disables input when at limit', () => {
    render(<UploadZone onFilesSelected={jest.fn()} currentFileCount={MAX_PHOTOS} maxFiles={MAX_PHOTOS} />)
    expect(screen.getByText(new RegExp(`maximum of ${MAX_PHOTOS} photos reached`, 'i'))).toBeInTheDocument()
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(input).toBeDisabled()
  })

  it('does not call onFilesSelected when at limit', async () => {
    const onFilesSelected = jest.fn()
    render(<UploadZone onFilesSelected={onFilesSelected} currentFileCount={MAX_PHOTOS} maxFiles={MAX_PHOTOS} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['img'], 'extra.jpg', { type: 'image/jpeg' })
    await userEvent.upload(input, file)
    expect(onFilesSelected).not.toHaveBeenCalled()
  })

  // ─── drag-and-drop event handlers ─────────────────────────────────────────

  it('calls onFilesSelected with dropped image files', () => {
    const onFilesSelected = jest.fn()
    const { container } = render(
      <UploadZone onFilesSelected={onFilesSelected} currentFileCount={0} />
    )
    const dropZone = container.firstChild as HTMLElement
    const file = new File(['img'], 'dropped.jpg', { type: 'image/jpeg' })

    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } })

    expect(onFilesSelected).toHaveBeenCalledWith([file])
  })

  it('filters out non-image files dropped onto the zone', () => {
    const onFilesSelected = jest.fn()
    const { container } = render(
      <UploadZone onFilesSelected={onFilesSelected} currentFileCount={0} />
    )
    const dropZone = container.firstChild as HTMLElement
    const pdf = new File(['data'], 'doc.pdf', { type: 'application/pdf' })
    const jpg = new File(['img'], 'photo.jpg', { type: 'image/jpeg' })

    fireEvent.drop(dropZone, { dataTransfer: { files: [pdf, jpg] } })

    expect(onFilesSelected).toHaveBeenCalledWith([jpg])
  })

  it('shows dragging text while a file is dragged over the zone', () => {
    const { container } = render(
      <UploadZone onFilesSelected={jest.fn()} currentFileCount={0} />
    )
    const dropZone = container.firstChild as HTMLElement

    fireEvent.dragOver(dropZone)

    expect(screen.getByText(/drop your photos here/i)).toBeInTheDocument()
  })

  it('restores the default text after drag leaves the zone', () => {
    const { container } = render(
      <UploadZone onFilesSelected={jest.fn()} currentFileCount={0} />
    )
    const dropZone = container.firstChild as HTMLElement

    fireEvent.dragOver(dropZone)
    fireEvent.dragLeave(dropZone)

    expect(screen.getByText(/upload photos/i)).toBeInTheDocument()
  })

  it('does not enter dragging state when already at the upload limit', () => {
    const { container } = render(
      <UploadZone onFilesSelected={jest.fn()} currentFileCount={MAX_PHOTOS} maxFiles={MAX_PHOTOS} />
    )
    const dropZone = container.firstChild as HTMLElement

    fireEvent.dragOver(dropZone)

    // Text stays as-is; dragging state is blocked when at limit
    expect(screen.queryByText(/drop your photos here/i)).not.toBeInTheDocument()
  })

  it('does not call onFilesSelected when all dropped files are non-images', () => {
    const onFilesSelected = jest.fn()
    const { container } = render(
      <UploadZone onFilesSelected={onFilesSelected} currentFileCount={0} />
    )
    const dropZone = container.firstChild as HTMLElement
    const pdf = new File(['data'], 'document.pdf', { type: 'application/pdf' })

    fireEvent.drop(dropZone, { dataTransfer: { files: [pdf] } })

    expect(onFilesSelected).not.toHaveBeenCalled()
  })

  it('does not call onFilesSelected when only non-image files are selected via input', async () => {
    const onFilesSelected = jest.fn()
    render(<UploadZone onFilesSelected={onFilesSelected} currentFileCount={0} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const pdf = new File(['data'], 'document.pdf', { type: 'application/pdf' })

    await userEvent.upload(input, pdf)

    expect(onFilesSelected).not.toHaveBeenCalled()
  })
})
