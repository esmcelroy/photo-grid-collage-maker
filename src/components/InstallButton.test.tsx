import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

// Mock usePwaInstall
const mockTriggerInstall = jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
let mockCanInstall = false
let mockIsIos = false
let mockIsStandalone = false

jest.unstable_mockModule('@/hooks/usePwaInstall', () => ({
  usePwaInstall: () => ({
    canInstall: mockCanInstall,
    triggerInstall: mockTriggerInstall,
    isIos: mockIsIos,
    isStandalone: mockIsStandalone,
  }),
}))

// Mock @phosphor-icons/react
jest.unstable_mockModule('@phosphor-icons/react', () => ({
  DownloadSimple: (props: any) => React.createElement('svg', { 'data-testid': 'download-icon', ...props }),
}))

const { InstallButton } = await import('@/components/InstallButton')

describe('InstallButton', () => {
  beforeEach(() => {
    mockCanInstall = false
    mockIsIos = false
    mockIsStandalone = false
    mockTriggerInstall.mockClear()
  })

  it('is hidden when running in standalone mode', () => {
    mockIsStandalone = true
    const { container } = render(React.createElement(InstallButton))
    expect(container).toBeEmptyDOMElement()
  })

  it('is hidden when canInstall is false and not iOS', () => {
    mockCanInstall = false
    mockIsIos = false
    const { container } = render(React.createElement(InstallButton))
    expect(container).toBeEmptyDOMElement()
  })

  it('renders when canInstall is true', () => {
    mockCanInstall = true
    render(React.createElement(InstallButton))
    expect(screen.getByRole('button', { name: /install app/i })).toBeInTheDocument()
  })

  it('renders when on iOS (even if canInstall is false)', () => {
    mockIsIos = true
    render(React.createElement(InstallButton))
    expect(screen.getByRole('button', { name: /install app/i })).toBeInTheDocument()
  })

  it('shows "Install" text', () => {
    mockCanInstall = true
    render(React.createElement(InstallButton))
    expect(screen.getByText('Install')).toBeInTheDocument()
  })

  it('calls triggerInstall on click when canInstall is true', async () => {
    mockCanInstall = true
    const user = userEvent.setup()
    render(React.createElement(InstallButton))

    await user.click(screen.getByRole('button', { name: /install app/i }))
    expect(mockTriggerInstall).toHaveBeenCalledTimes(1)
  })

  it('shows iOS instructions popover on click when isIos is true', async () => {
    mockIsIos = true
    const user = userEvent.setup()
    render(React.createElement(InstallButton))

    await user.click(screen.getByRole('button', { name: /install app/i }))
    expect(
      await screen.findByText(/Tap the Share button, then 'Add to Home Screen'/i)
    ).toBeInTheDocument()
  })
})
