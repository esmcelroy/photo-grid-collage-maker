import { jest, describe, expect, it } from '@jest/globals'
import { render, screen } from '@testing-library/react'
import { axe } from 'jest-axe'
import React from 'react'

const collageApi = jest.fn()

jest.unstable_mockModule('@/hooks/useCollageApi', () => ({ useCollageApi: collageApi }))
jest.unstable_mockModule('@/hooks/use-dark-mode', () => ({ useDarkMode: () => ({ theme: 'light', setTheme: jest.fn(), isDark: false }) }))
jest.unstable_mockModule('@/hooks/use-smart-position', () => ({ useSmartPositioning: () => ({ enabled: false, setEnabled: jest.fn(), detectionMode: 'basic', setDetectionMode: jest.fn() }) }))
jest.unstable_mockModule('@/hooks/useOnlineStatus', () => ({ useOnlineStatus: () => ({ isOnline: true }) }))
jest.unstable_mockModule('@/hooks/useServiceWorker', () => ({ useServiceWorker: () => ({ needRefresh: false, updateSw: jest.fn(), offlineReady: false }) }))
jest.unstable_mockModule('@/lib/ml-worker-client', () => ({ getWorkerStatus: () => 'idle', onWorkerStatusChange: () => () => {}, disposeMLWorker: jest.fn(), initMLWorker: jest.fn(), hasNativeFaceDetector: () => false, detectCombined: jest.fn(), detectFacesML: jest.fn(), getWorkerModel: jest.fn() }))

const { default: App } = await import('@/App')

const baseApi = {
  collageId: 'session', photos: [], selectedLayoutId: null, photoPositions: [],
  settings: { gap: 8, backgroundColor: 'transparent', borderRadius: 0 },
  isInitializing: false, initError: null, sessionError: null, error: null,
  initCollage: jest.fn<() => Promise<void>>().mockResolvedValue(undefined), recoverSession: jest.fn<() => Promise<void>>().mockResolvedValue(undefined), retryInitialization: jest.fn<() => Promise<void>>().mockResolvedValue(undefined), retry: jest.fn(),
  addPhoto: jest.fn(), removePhoto: jest.fn(), updateLayout: jest.fn(), updatePositions: jest.fn(), updateSettings: jest.fn(), clearAll: jest.fn(),
}

describe('App storage recovery UI', () => {
  it('shows a blocking loading state while an existing session is read', () => {
    collageApi.mockReturnValue({ ...baseApi, isLoading: true })
    render(<App />)
    expect(screen.getByText('Opening your collage…')).toBeVisible()
  })

  it('explains a stale session, offers explicit recovery, and has no accessibility violations', async () => {
    collageApi.mockReturnValue({ ...baseApi, isLoading: false, sessionError: { kind: 'missing', error: new Error('missing') } })
    const { container } = render(<App />)
    expect(screen.getByRole('heading', { name: 'Your saved collage is unavailable' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Create new collage' })).toBeVisible()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('offers a safe retry when an existing collage cannot be read', () => {
    const retry = jest.fn()
    collageApi.mockReturnValue({ ...baseApi, isLoading: false, sessionError: { kind: 'read', error: new Error('database unavailable') }, retry })
    render(<App />)
    expect(screen.getByRole('heading', { name: 'We could not open your collage' })).toBeVisible()
    screen.getByRole('button', { name: 'Try again' }).click()
    expect(retry).toHaveBeenCalled()
  })
})
