import '@testing-library/jest-dom'
import 'jest-axe/extend-expect'

// Polyfill browser APIs not implemented by jsdom that Radix UI components require
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(globalThis, 'ResizeObserver', {
  writable: true,
  configurable: true,
  value: ResizeObserverMock,
})

