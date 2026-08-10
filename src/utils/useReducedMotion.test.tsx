import { AccessibilityInfo } from "react-native"
import { act, renderHook, waitFor } from "@testing-library/react-native"

import {
  motionDuration,
  resetReducedMotionCacheForTests,
  useReducedMotion,
} from "./useReducedMotion"

describe("useReducedMotion", () => {
  beforeEach(() => {
    resetReducedMotionCacheForTests()
  })

  it("initializes later mounts from the last known preference without waiting", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false)
    const first = renderHook(() => useReducedMotion())
    await waitFor(() => expect(first.result.current).toBe(false))
    first.unmount()

    const second = renderHook(() => useReducedMotion())
    expect(second.result.current).toBe(false)
  })

  it("is fail-safe while loading and follows runtime preference changes", async () => {
    let resolve!: (value: boolean) => void
    jest
      .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
      .mockReturnValue(new Promise<boolean>((done) => (resolve = done)))
    let listener: ((value: boolean) => void) | undefined
    jest.spyOn(AccessibilityInfo, "addEventListener").mockImplementation(((
      _event: string,
      next: (value: boolean) => void,
    ) => {
      listener = next
      return { remove: jest.fn() } as any
    }) as any)
    const hook = renderHook(() => useReducedMotion())
    expect(hook.result.current).toBeNull()
    await act(async () => resolve(true))
    await waitFor(() => expect(hook.result.current).toBe(true))
    act(() => listener?.(false))
    expect(hook.result.current).toBe(false)
  })

  it("enables optional feedback when the initial system preference resolves false", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false)
    const hook = renderHook(() => useReducedMotion())
    expect(hook.result.current).toBeNull()
    await waitFor(() => expect(hook.result.current).toBe(false))
  })

  it("uses immediate updates until motion is explicitly allowed", () => {
    expect(motionDuration(null, 300)).toBe(0)
    expect(motionDuration(true, 300)).toBe(0)
    expect(motionDuration(false, 300)).toBe(300)
  })
})
