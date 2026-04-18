import { renderHook, act } from '@testing-library/react'
import { useCollageHistory, CollageSnapshot } from './use-collage-history'

function makeSnapshot(overrides: Partial<CollageSnapshot> = {}): CollageSnapshot {
  return {
    selectedLayoutId: overrides.selectedLayoutId ?? 'layout-1',
    photoPositions: overrides.photoPositions ?? [],
    settings: overrides.settings ?? { gap: 4, backgroundColor: '#ffffff', borderRadius: 0 },
  }
}

describe('useCollageHistory', () => {
  it('starts with empty stacks', () => {
    const { result } = renderHook(() => useCollageHistory())
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(false)
  })

  it('pushSnapshot adds to past and clears future', () => {
    const { result } = renderHook(() => useCollageHistory())
    const s1 = makeSnapshot({ selectedLayoutId: 's1' })
    const s2 = makeSnapshot({ selectedLayoutId: 's2' })

    act(() => result.current.pushSnapshot(s1))
    expect(result.current.canUndo).toBe(true)

    // Simulate an undo to populate future
    const current = makeSnapshot({ selectedLayoutId: 'current' })
    act(() => { result.current.undo(current) })
    expect(result.current.canRedo).toBe(true)

    // Push clears future
    act(() => result.current.pushSnapshot(s2))
    expect(result.current.canRedo).toBe(false)
  })

  it('undo returns previous snapshot and pushes current to future', () => {
    const { result } = renderHook(() => useCollageHistory())
    const s1 = makeSnapshot({ selectedLayoutId: 's1' })
    const current = makeSnapshot({ selectedLayoutId: 'current' })

    act(() => result.current.pushSnapshot(s1))

    let restored: CollageSnapshot | null = null
    act(() => { restored = result.current.undo(current) })

    expect(restored).toEqual(s1)
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(true)
  })

  it('redo returns next snapshot and pushes current to past', () => {
    const { result } = renderHook(() => useCollageHistory())
    const s1 = makeSnapshot({ selectedLayoutId: 's1' })
    const current = makeSnapshot({ selectedLayoutId: 'current' })
    const afterUndo = makeSnapshot({ selectedLayoutId: 'after-undo' })

    act(() => result.current.pushSnapshot(s1))
    act(() => { result.current.undo(current) })

    let restored: CollageSnapshot | null = null
    act(() => { restored = result.current.redo(afterUndo) })

    expect(restored).toEqual(current)
    expect(result.current.canRedo).toBe(false)
    expect(result.current.canUndo).toBe(true)
  })

  it('undo with empty past returns null', () => {
    const { result } = renderHook(() => useCollageHistory())
    const current = makeSnapshot()
    let restored: CollageSnapshot | null = null
    act(() => { restored = result.current.undo(current) })
    expect(restored).toBeNull()
  })

  it('redo with empty future returns null', () => {
    const { result } = renderHook(() => useCollageHistory())
    const current = makeSnapshot()
    let restored: CollageSnapshot | null = null
    act(() => { restored = result.current.redo(current) })
    expect(restored).toBeNull()
  })

  it('maxDepth limits past size', () => {
    const { result } = renderHook(() => useCollageHistory(3))

    for (let i = 0; i < 5; i++) {
      act(() => result.current.pushSnapshot(makeSnapshot({ selectedLayoutId: `s${i}` })))
    }

    // Should only keep last 3 snapshots (maxDepth=3, keeps -(3-1)=last 2 before push + the new one = 3)
    // Actually: slice(-(maxDepth-1)) keeps last 2, then new one is appended = 3 total
    let count = 0
    const current = makeSnapshot({ selectedLayoutId: 'current' })
    // Undo until empty
    while (true) {
      let restored: CollageSnapshot | null = null
      act(() => { restored = result.current.undo(current) })
      if (restored === null) break
      count++
    }
    expect(count).toBe(3)
  })

  it('clear empties both stacks', () => {
    const { result } = renderHook(() => useCollageHistory())
    const s1 = makeSnapshot({ selectedLayoutId: 's1' })
    const current = makeSnapshot({ selectedLayoutId: 'current' })

    act(() => result.current.pushSnapshot(s1))
    act(() => { result.current.undo(current) })
    expect(result.current.canRedo).toBe(true)

    act(() => result.current.clear())
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(false)
  })

  it('isRestoring prevents pushSnapshot', () => {
    const { result } = renderHook(() => useCollageHistory())
    const s1 = makeSnapshot({ selectedLayoutId: 's1' })

    act(() => result.current.setRestoring(true))
    act(() => result.current.pushSnapshot(s1))
    expect(result.current.canUndo).toBe(false)

    act(() => result.current.setRestoring(false))
    act(() => result.current.pushSnapshot(s1))
    expect(result.current.canUndo).toBe(true)
  })
})
