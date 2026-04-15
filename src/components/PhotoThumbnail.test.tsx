import React from 'react'
import { jest } from '@jest/globals'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PhotoThumbnail } from '@/components/PhotoThumbnail'

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

const mockPhoto = {
  id: 'photo-1',
  file: new File(['img'], 'sunset.jpg', { type: 'image/jpeg' }),
  dataUrl: 'data:image/jpeg;base64,abc123',
}

describe('PhotoThumbnail', () => {
  it('renders the photo image', () => {
    render(<PhotoThumbnail photo={mockPhoto} onRemove={jest.fn()} index={0} />)
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('src', mockPhoto.dataUrl)
  })

  it('shows the filename', () => {
    render(<PhotoThumbnail photo={mockPhoto} onRemove={jest.fn()} index={0} />)
    expect(screen.getByText('sunset.jpg')).toBeInTheDocument()
  })

  it('calls onRemove with photo id when remove button is clicked', async () => {
    const onRemove = jest.fn()
    render(<PhotoThumbnail photo={mockPhoto} onRemove={onRemove} index={0} />)
    const removeBtn = screen.getByRole('button')
    await userEvent.click(removeBtn)
    expect(onRemove).toHaveBeenCalledWith('photo-1')
  })
})
