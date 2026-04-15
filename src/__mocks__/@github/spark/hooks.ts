export const useKV = jest.fn((key: string, defaultValue: unknown) => {
  return [defaultValue, jest.fn()]
})
