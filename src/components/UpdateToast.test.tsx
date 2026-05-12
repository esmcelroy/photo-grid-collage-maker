import { jest, describe, it, expect } from '@jest/globals'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

// Mock framer-motion
jest.unstable_mockModule('framer-motion', () => ({
  motion: {
    div: React.forwardRef(({ children, ...props }: any, ref: any) =>
      React.createElement('div', { ...props, ref }, children)
    ),
  },
  AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children),
}))

const { UpdateToast } = await import('@/components/UpdateToast')

describe('UpdateToast', () => {
  it('renders nothing when needRefresh is false', () => {
    const { container } = render(
      React.createElement(UpdateToast, { needRefresh: false, onRefresh: jest.fn() })
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders update message when needRefresh is true', () => {
    render(React.createElement(UpdateToast, { needRefresh: true, onRefresh: jest.fn() }))
    expect(screen.getByText('A new version is available')).toBeInTheDocument()
  })

  it('renders Refresh Now and Dismiss buttons', () => {
    render(React.createElement(UpdateToast, { needRefresh: true, onRefresh: jest.fn() }))
    expect(screen.getByRole('button', { name: /refresh now/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument()
  })

  it('calls onRefresh when Refresh Now is clicked', async () => {
    const onRefresh = jest.fn()
    const user = userEvent.setup()
    render(React.createElement(UpdateToast, { needRefresh: true, onRefresh }))

    await user.click(screen.getByRole('button', { name: /refresh now/i }))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('hides the toast when Dismiss is clicked', async () => {
    const user = userEvent.setup()
    render(React.createElement(UpdateToast, { needRefresh: true, onRefresh: jest.fn() }))

    await user.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(screen.queryByText('A new version is available')).not.toBeInTheDocument()
  })
})
