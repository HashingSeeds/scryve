import { act, renderHook } from "@testing-library/react-native"

import { useSettledLayout } from "./useSettledLayout"

describe("useSettledLayout", () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it("passes each layout straight through while the card is at rest", () => {
    const set = jest.fn()
    const { result } = renderHook(() => useSettledLayout(set, false))

    result.current(1)
    result.current(2)

    expect(set.mock.calls).toEqual([[1], [2]])
  })

  it("keeps only the layout a moving card settles on", () => {
    const set = jest.fn()
    const { result } = renderHook(() => useSettledLayout(set, true))

    result.current(1)
    act(() => jest.advanceTimersByTime(60))
    result.current(2)
    expect(set).not.toHaveBeenCalled()

    act(() => jest.advanceTimersByTime(120))
    expect(set.mock.calls).toEqual([[2]])
  })
})
