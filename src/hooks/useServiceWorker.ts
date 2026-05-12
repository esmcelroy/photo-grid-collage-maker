import { useRegisterSW } from 'virtual:pwa-register/react'

export function useServiceWorker(): {
  needRefresh: boolean
  updateSw: () => void
  offlineReady: boolean
} {
  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady],
    updateServiceWorker,
  } = useRegisterSW()

  const updateSw = () => {
    updateServiceWorker(true)
  }

  return { needRefresh, updateSw, offlineReady }
}
