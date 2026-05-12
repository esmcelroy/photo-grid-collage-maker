// Mock for virtual:pwa-register/react (Vite virtual module)
export const useRegisterSW = () => ({
  needRefresh: [false, () => {}],
  offlineReady: [false, () => {}],
  updateServiceWorker: () => {},
})
