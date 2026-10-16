import { useFonts } from "expo-font"
import { SplashScreen } from "expo-router"
import { act, renderHook, waitFor } from "@testing-library/react-native"

import { reportCrash } from "@/utils/crashReporting"

import {
  LAUNCH_DEADLINE_MS,
  LAUNCH_FALLBACK_REVEAL_MS,
  useLaunchReadiness,
} from "./useLaunchReadiness"

jest.mock("expo-router", () => ({
  SplashScreen: { hideAsync: jest.fn(() => Promise.resolve()) },
}))
jest.mock("expo-font", () => ({ useFonts: jest.fn() }))
jest.mock("@/utils/crashReporting", () => ({ reportCrash: jest.fn() }))

const useFontsMock = jest.mocked(useFonts)
const reportCrashMock = jest.mocked(reportCrash)
const hideSplashMock = jest.mocked(SplashScreen.hideAsync)

describe("useLaunchReadiness", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    useFontsMock.mockReturnValue([false, null])
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it("hands a normal fast launch straight from the native splash to the app", () => {
    let fontsLoaded = false
    useFontsMock.mockImplementation(() => [fontsLoaded, null])

    const hook = renderHook<boolean, { consentResolved: boolean }>(
      ({ consentResolved }) => useLaunchReadiness(consentResolved),
      { initialProps: { consentResolved: false } },
    )

    expect(hook.result.current).toBe(false)
    expect(hideSplashMock).not.toHaveBeenCalled()

    fontsLoaded = true
    hook.rerender({ consentResolved: false })
    expect(hook.result.current).toBe(true)
    expect(hideSplashMock).not.toHaveBeenCalled()

    hook.rerender({ consentResolved: true })
    expect(hideSplashMock).toHaveBeenCalledTimes(1)
  })

  it("uses the system typeface and reports the error when fonts fail", async () => {
    const fontError = new Error("font unavailable")
    useFontsMock.mockReturnValue([false, fontError])

    const hook = renderHook(() => useLaunchReadiness(false))

    await waitFor(() => expect(hook.result.current).toBe(true))
    expect(reportCrashMock).toHaveBeenCalledWith(fontError)
  })

  it("reveals the React launch fallback when startup takes longer than 700ms", () => {
    jest.useFakeTimers()
    useFontsMock.mockReturnValue([false, null])

    const hook = renderHook(() => useLaunchReadiness(false))

    act(() => void jest.advanceTimersByTime(LAUNCH_FALLBACK_REVEAL_MS - 1))
    expect(hook.result.current).toBe(false)
    expect(hideSplashMock).not.toHaveBeenCalled()

    act(() => void jest.advanceTimersByTime(1))
    expect(hook.result.current).toBe(false)
    expect(hideSplashMock).toHaveBeenCalledTimes(1)
  })

  it("enters the degraded path at the existing 8000ms deadline", () => {
    jest.useFakeTimers()
    useFontsMock.mockReturnValue([false, null])

    const hook = renderHook(() => useLaunchReadiness(true))

    act(() => void jest.advanceTimersByTime(LAUNCH_FALLBACK_REVEAL_MS))
    expect(hideSplashMock).toHaveBeenCalledTimes(1)

    act(() => void jest.advanceTimersByTime(LAUNCH_DEADLINE_MS - LAUNCH_FALLBACK_REVEAL_MS - 1))
    expect(hook.result.current).toBe(false)

    act(() => void jest.advanceTimersByTime(1))
    expect(hook.result.current).toBe(true)
    expect(hideSplashMock).toHaveBeenCalledTimes(1)
  })

  it("never hides the splash until readiness and consent both hold", () => {
    let fontsLoaded = false
    useFontsMock.mockImplementation(() => [fontsLoaded, null])

    const hook = renderHook<boolean, { consentResolved: boolean }>(
      ({ consentResolved }) => useLaunchReadiness(consentResolved),
      { initialProps: { consentResolved: false } },
    )

    hook.rerender({ consentResolved: true })
    expect(hideSplashMock).not.toHaveBeenCalled()

    fontsLoaded = true
    hook.rerender({ consentResolved: true })
    expect(hideSplashMock).toHaveBeenCalledTimes(1)

    hook.rerender({ consentResolved: true })
    expect(hideSplashMock).toHaveBeenCalledTimes(1)
  })
})
