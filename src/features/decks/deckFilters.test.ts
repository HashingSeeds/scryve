import { act, renderHook } from "@testing-library/react-native"

import { clear, loadString } from "@/utils/storage"

import { ALL_FORMATS, useDeckFilters } from "./deckFilters"

describe("useDeckFilters", () => {
  afterEach(() => {
    clear()
  })

  it("persists an explicitly selected format under the new game", () => {
    const hook = renderHook(() => useDeckFilters())

    act(() => hook.result.current.setFormat("modern"))
    act(() => hook.result.current.setGame("ygo", "advanced"))

    expect(hook.result.current.game).toBe("ygo")
    expect(hook.result.current.format).toBe("advanced")
    expect(loadString("decks.format.mtg")).toBe("modern")
    expect(loadString("decks.format.ygo")).toBe("advanced")
  })

  it("restores the saved format when no override is provided", () => {
    const hook = renderHook(() => useDeckFilters())

    act(() => hook.result.current.setGame("ygo", "traditional"))
    act(() => hook.result.current.setGame("mtg", "modern"))
    act(() => hook.result.current.setGame("ygo"))

    expect(hook.result.current.game).toBe("ygo")
    expect(hook.result.current.format).toBe("traditional")
  })

  it("falls back to all formats when the next game has no saved format", () => {
    const hook = renderHook(() => useDeckFilters())

    act(() => hook.result.current.setGame("pokemon"))

    expect(hook.result.current.format).toBe(ALL_FORMATS)
  })
})
