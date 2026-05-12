import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { OfflineBanner } from '@/components/OfflineBanner'

// Mock framer-motion to avoid animation timing issues in tests
jest.unstable_mockModule('framer-motion', () => ({
  motion: {
    div: React.forwardRef(({ children, ...props }: any, ref: any) =>
      React.createElement('div', { ...props, ref }, children)
    ),
  },
  AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children),
}))

// Re-import after mock
const { OfflineBanner: OfflineBannerMocked } = await import('@/components/OfflineBanner')

describe('OfflineBanner', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders offline message when isOnline is false', () => {
    render(React.createElement(OfflineBannerMocked, { isOnline: false, offlineReady: false }))
    expect(screen.getByText("You're offline — everything still works")).toBeInTheDocument()
  })

  it('does not render offline message when isOnline is true', () => {
    render(React.createElement(OfflineBannerMocked, { isOnline: true, offlineReady: false }))
    expect(screen.queryByText("You're offline — everything still works")).not.toBeInTheDocument()
  })

  it('shows "Ready for offline use ✓" when offlineReady is true and not previously shown', () => {
    render(React.createElement(OfflineBannerMocked, { isOnline: true, offlineReady: true }))
    expect(screen.getByText('Ready for offline use ✓')).toBeInTheDocument()
  })

  it('does not show offline-ready message if already shown (localStorage)', () => {
    localStorage.setItem('pwa-offline-ready-shown', 'true')
    render(React.createElement(OfflineBannerMocked, { isOnline: true, offlineReady: true }))
    expect(screen.queryByText('Ready for offline use ✓')).not.toBeInTheDocument()
  })

  it('sets localStorage after showing offline-ready message', () => {
    render(React.createElement(OfflineBannerMocked, { isOnline: true, offlineReady: true }))
    expect(localStorage.getItem('pwa-offline-ready-shown')).toBe('true')
  })

  it('auto-dismisses the offline-ready message after 4 seconds', async () => {
    jest.useFakeTimers()
    render(React.createElement(OfflineBannerMocked, { isOnline: true, offlineReady: true }))
    expect(screen.getByText('Ready for offline use ✓')).toBeInTheDocument()

    jest.advanceTimersByTime(4000)

    await waitFor(() => {
      expect(screen.queryByText('Ready for offline use ✓')).not.toBeInTheDocument()
    })

    jest.useRealTimers()
  })

  it('prioritizes offline banner over offline-ready message', () => {
    render(React.createElement(OfflineBannerMocked, { isOnline: false, offlineReady: true }))
    expect(screen.getByText("You're offline — everything still works")).toBeInTheDocument()
    expect(screen.queryByText('Ready for offline use ✓')).not.toBeInTheDocument()
  })
})
