import { act, renderHook } from "@testing-library/react-native"

import { useProSignIn } from "./ProSignIn"

const mockOpenAuth = jest.fn()
let mockAuth = { isSignedIn: false, authVisible: false }
let mockBilling = { isReady: false, isLoading: false, isCountPro: false }

jest.mock("@/features/auth/AuthContext", () => ({
  useAuthAccess: () => ({ ...mockAuth, openAuth: mockOpenAuth }),
}))
jest.mock("./RevenueCatContext", () => ({
  useRevenueCat: () => mockBilling,
}))

function setup() {
  const openPaywall = jest.fn()
  const hook = renderHook(() => useProSignIn(openPaywall))
  const update = (auth: Partial<typeof mockAuth>, billing: Partial<typeof mockBilling> = {}) => {
    mockAuth = { ...mockAuth, ...auth }
    mockBilling = { ...mockBilling, ...billing }
    hook.rerender({})
  }
  return { ...hook, openPaywall, update }
}

describe("useProSignIn", () => {
  beforeEach(() => {
    mockOpenAuth.mockReset().mockImplementation(() => {
      mockAuth = { ...mockAuth, authVisible: true }
    })
    mockAuth = { isSignedIn: false, authVisible: false }
    mockBilling = { isReady: false, isLoading: false, isCountPro: false }
  })

  it("explains first, then opens the paywall once billing loads an account without Pro", () => {
    const { result, openPaywall, update } = setup()
    act(() => result.current.request())
    expect(result.current.explaining).toBe(true)
    expect(mockOpenAuth).not.toHaveBeenCalled()

    act(() => result.current.signIn())
    expect(mockOpenAuth).toHaveBeenCalledTimes(1)
    update({ authVisible: false })
    update({ isSignedIn: true }, { isReady: true, isLoading: true })
    expect(openPaywall).not.toHaveBeenCalled()
    update({}, { isLoading: false })
    expect(openPaywall).toHaveBeenCalledTimes(1)
    update({}, { isLoading: false })
    expect(openPaywall).toHaveBeenCalledTimes(1)
  })

  it("skips the paywall for an account that already has Pro", () => {
    const { result, openPaywall, update } = setup()
    act(() => result.current.signIn())
    update({ isSignedIn: true, authVisible: false }, { isReady: true, isCountPro: true })
    expect(openPaywall).not.toHaveBeenCalled()
  })

  it("forgets the request when sign in is closed and no session follows", () => {
    jest.useFakeTimers()
    const { result, openPaywall, update } = setup()
    act(() => result.current.signIn())
    update({ authVisible: false })
    act(() => jest.advanceTimersByTime(5000))
    update({ isSignedIn: true }, { isReady: true })
    expect(openPaywall).not.toHaveBeenCalled()
    jest.useRealTimers()
  })
})
