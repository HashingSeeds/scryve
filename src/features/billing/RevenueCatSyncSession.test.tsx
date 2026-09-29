import type { ReactNode } from "react"
import { act, render, waitFor } from "@testing-library/react-native"

import type { ConnectedProfileState } from "@/features/connected/useConnectedProfile"
import { reportCrash } from "@/utils/crashReporting"

import { RevenueCatSyncSession } from "./RevenueCatSyncSession"

const mockSyncCurrent = jest.fn<Promise<{ synced: boolean; enabled: boolean }>, [object]>()
const mockRefreshCustomerInfo = jest.fn<Promise<object | null>, [boolean?]>()
let mockProfile: ConnectedProfileState
let mockCustomerInfo: object | null
let mockLoading = false

jest.mock("convex/react", () => ({ useAction: () => mockSyncCurrent }))
jest.mock("../../../convex/_generated/api", () => ({
  api: { revenuecat: { syncCurrent: "revenuecat.syncCurrent" } },
}))
jest.mock("@/features/connected/useConnectedProfile", () => ({
  ConnectedProfileProvider: ({ children }: { children: ReactNode }) => children,
  useConnectedProfile: () => mockProfile,
}))
jest.mock("./RevenueCatContext", () => ({
  useRevenueCat: () => ({
    customerInfo: mockCustomerInfo,
    isLoading: mockLoading,
    refreshCustomerInfo: mockRefreshCustomerInfo,
  }),
}))
jest.mock("@/utils/crashReporting", () => ({
  ErrorType: { HANDLED: "Handled" },
  reportCrash: jest.fn(),
}))

function ready(userId = "user_a"): ConnectedProfileState {
  return { status: "ready", profile: { userId, displayName: "Player" }, retry: jest.fn() }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockProfile = ready()
  mockCustomerInfo = { entitlements: { active: {} } }
  mockLoading = false
  mockSyncCurrent.mockResolvedValue({ synced: true, enabled: true })
  mockRefreshCustomerInfo.mockResolvedValue(mockCustomerInfo)
})

it("catches up existing subscribers and refreshes after purchase or restore without trusting client claims", () => {
  const view = render(<RevenueCatSyncSession />)
  expect(mockSyncCurrent).toHaveBeenCalledWith({})
  view.rerender(<RevenueCatSyncSession />)
  expect(mockSyncCurrent).toHaveBeenCalledTimes(1)

  mockCustomerInfo = { entitlements: { active: { "Count Pro": {} } } }
  view.rerender(<RevenueCatSyncSession />)
  expect(mockSyncCurrent).toHaveBeenCalledTimes(2)
  expect(mockSyncCurrent).toHaveBeenLastCalledWith({})
})

it("waits for the profile and billing, then retries on reconnect and account changes", () => {
  mockProfile = { status: "loading", reason: "profile", retry: jest.fn() }
  const view = render(<RevenueCatSyncSession />)
  expect(mockSyncCurrent).not.toHaveBeenCalled()
  mockProfile = ready()
  mockLoading = true
  view.rerender(<RevenueCatSyncSession />)
  expect(mockSyncCurrent).not.toHaveBeenCalled()
  mockLoading = false
  view.rerender(<RevenueCatSyncSession />)
  expect(mockSyncCurrent).toHaveBeenCalledTimes(1)

  mockProfile = { status: "offline", retry: jest.fn() }
  view.rerender(<RevenueCatSyncSession />)
  expect(mockSyncCurrent).toHaveBeenCalledTimes(1)
  mockProfile = ready()
  view.rerender(<RevenueCatSyncSession />)
  expect(mockSyncCurrent).toHaveBeenCalledTimes(2)
  expect(mockRefreshCustomerInfo).toHaveBeenCalledTimes(1)
  expect(mockRefreshCustomerInfo).toHaveBeenCalledWith(true)
  mockProfile = ready("user_b")
  view.rerender(<RevenueCatSyncSession />)
  expect(mockSyncCurrent).toHaveBeenCalledTimes(3)
  expect(mockRefreshCustomerInfo).toHaveBeenCalledTimes(2)
})

it("leaves cached billing state intact when the server cannot sync", async () => {
  const failure = new Error("RevenueCat unavailable")
  mockSyncCurrent.mockRejectedValueOnce(failure)
  const cached = mockCustomerInfo
  render(<RevenueCatSyncSession />)
  await waitFor(() => expect(reportCrash).toHaveBeenCalledWith(failure, "Handled"))
  expect(mockCustomerInfo).toBe(cached)
})

it("retries a failed server sync and cancels the next retry when the profile goes offline", async () => {
  jest.useFakeTimers()
  try {
    mockSyncCurrent.mockRejectedValueOnce(new Error("temporary failure"))
    mockSyncCurrent.mockRejectedValueOnce(new Error("still offline"))
    const view = render(<RevenueCatSyncSession />)
    await act(async () => undefined)
    expect(mockSyncCurrent).toHaveBeenCalledTimes(1)

    await act(async () => jest.advanceTimersByTime(1_000))
    expect(mockSyncCurrent).toHaveBeenCalledTimes(2)

    mockProfile = { status: "offline", retry: jest.fn() }
    view.rerender(<RevenueCatSyncSession />)
    await act(async () => jest.advanceTimersByTime(30_000))
    expect(mockSyncCurrent).toHaveBeenCalledTimes(2)
  } finally {
    jest.useRealTimers()
  }
})

it("retries a failed customer-info refresh after reconnect", async () => {
  jest.useFakeTimers()
  try {
    mockProfile = { status: "offline", retry: jest.fn() }
    mockRefreshCustomerInfo.mockResolvedValueOnce(null)
    const view = render(<RevenueCatSyncSession />)
    mockProfile = ready()
    view.rerender(<RevenueCatSyncSession />)
    await act(async () => undefined)
    expect(mockRefreshCustomerInfo).toHaveBeenCalledTimes(1)

    await act(async () => jest.advanceTimersByTime(1_000))
    expect(mockRefreshCustomerInfo).toHaveBeenCalledTimes(2)
    expect(mockRefreshCustomerInfo).toHaveBeenLastCalledWith(true)
  } finally {
    jest.useRealTimers()
  }
})

it("can recover server access even when the SDK could not load customer info", () => {
  mockCustomerInfo = null
  render(<RevenueCatSyncSession />)
  expect(mockSyncCurrent).toHaveBeenCalledWith({})
})
