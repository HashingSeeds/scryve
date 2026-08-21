import { SplashScreen } from "expo-router"
import { useFonts } from "@expo-google-fonts/space-grotesk"
import { act, renderHook, waitFor } from "@testing-library/react-native"

import { initI18n } from "@/i18n"
import { reportCrash } from "@/utils/crashReporting"
import { loadDateFnsLocale } from "@/utils/formatDate"

import { LAUNCH_DEADLINE_MS, useLaunchReadiness } from "./useLaunchReadiness"

jest.mock("expo-router", () => ({
  SplashScreen: { hideAsync: jest.fn(() => Promise.resolve()) },
}))
jest.mock("@expo-google-fonts/space-grotesk", () => ({ useFonts: jest.fn() }))
jest.mock("@/i18n", () => ({ initI18n: jest.fn() }))
jest.mock("@/utils/formatDate", () => ({ loadDateFnsLocale: jest.fn() }))
jest.mock("@/utils/crashReporting", () => ({ reportCrash: jest.fn() }))

const useFontsMock = jest.mocked(useFonts)
const initI18nMock = jest.mocked(initI18n)
const loadDateFnsLocaleMock = jest.mocked(loadDateFnsLocale)
const reportCrashMock = jest.mocked(reportCrash)
const hideSplashMock = jest.mocked(SplashScreen.hideAsync)

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

describe("useLaunchReadiness", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    useFontsMock.mockReturnValue([false, null])
    initI18nMock.mockResolvedValue(undefined as never)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it("waits for fonts and i18n, then hides the splash after consent resolves", async () => {
    const i18n = deferred<never>()
    initI18nMock.mockReturnValue(i18n.promise)
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
    expect(hook.result.current).toBe(false)

    await act(async () => i18n.resolve(undefined as never))
    expect(loadDateFnsLocaleMock).toHaveBeenCalledTimes(1)
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

  it("becomes ready at the 8000ms deadline when i18n never settles", () => {
    jest.useFakeTimers()
    useFontsMock.mockReturnValue([true, null])
    initI18nMock.mockReturnValue(new Promise<never>(() => undefined))

    const hook = renderHook(() => useLaunchReadiness(true))

    act(() => void jest.advanceTimersByTime(LAUNCH_DEADLINE_MS - 1))
    expect(hook.result.current).toBe(false)
    expect(hideSplashMock).not.toHaveBeenCalled()

    act(() => void jest.advanceTimersByTime(1))
    expect(hook.result.current).toBe(true)
    expect(hideSplashMock).toHaveBeenCalledTimes(1)
  })

  it("reports rejected i18n initialization and still becomes ready", async () => {
    const i18nError = new Error("i18n unavailable")
    useFontsMock.mockReturnValue([true, null])
    initI18nMock.mockRejectedValue(i18nError)

    const hook = renderHook(() => useLaunchReadiness(false))

    await waitFor(() => expect(hook.result.current).toBe(true))
    expect(reportCrashMock).toHaveBeenCalledWith(i18nError)
    expect(loadDateFnsLocaleMock).not.toHaveBeenCalled()
  })

  it("never hides the splash until readiness and consent both hold", async () => {
    const i18n = deferred<never>()
    initI18nMock.mockReturnValue(i18n.promise)
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
    expect(hideSplashMock).not.toHaveBeenCalled()

    await act(async () => i18n.resolve(undefined as never))
    expect(hideSplashMock).toHaveBeenCalledTimes(1)

    hook.rerender({ consentResolved: true })
    expect(hideSplashMock).toHaveBeenCalledTimes(1)
  })
})
