import { AppState } from "react-native"
import { act, render, waitFor } from "@testing-library/react-native"

import { storage } from "@/utils/storage"

import { PushDeviceSync } from "./PushDeviceSync"

const mockSync = jest.fn()
const mockForget = jest.fn()
const mockToken = jest.fn<Promise<string | null>, []>()
let mockPushOn = true

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }))
jest.mock("convex/react", () => ({
  useConvexAuth: () => ({ isLoading: false, isAuthenticated: false }),
  useMutation: (ref: string) => (ref === "forget" ? mockForget : mockSync),
}))
jest.mock("../../../convex/_generated/api", () => ({
  api: { notifications: { syncDevice: "sync", forgetDevice: "forget" } },
}))
jest.mock("@/features/auth/AuthContext", () => ({ useAuthAccess: () => ({ configured: true }) }))
jest.mock("@/features/connected/useConvexOnline", () => ({ useConvexOnline: () => true }))
jest.mock("@/features/feedback/feedbackKey", () => ({ useFeedbackKey: () => "key" }))
jest.mock("./prefs", () => ({ usePushPref: () => mockPushOn }))
jest.mock("./device", () => ({
  pushSupported: true,
  pushToken: () => mockToken(),
  onNotificationOpened: () => () => undefined,
}))

describe("PushDeviceSync", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    storage.clearAll()
    mockPushOn = true
  })

  it("forgets a registered device once notifications are off in system settings", async () => {
    const appState = jest.spyOn(AppState, "addEventListener")
    mockToken.mockResolvedValueOnce("ExpoPushToken[phone]")
    render(<PushDeviceSync />)
    await waitFor(() => expect(mockSync).toHaveBeenCalled())

    mockToken.mockResolvedValueOnce(null)
    act(() => appState.mock.calls.forEach(([, listener]) => listener("active")))
    await waitFor(() => expect(mockForget).toHaveBeenCalledWith({ key: "key" }))
  })

  it("still forgets after turning off, on, and off again while the first forget is in flight", async () => {
    let finishForget: () => void = () => undefined
    mockForget.mockImplementationOnce(
      () => new Promise<void>((resolve) => (finishForget = resolve)),
    )
    storage.set("notifications.registered", true)
    mockPushOn = false
    const { rerender } = render(<PushDeviceSync />)
    await waitFor(() => expect(mockForget).toHaveBeenCalledTimes(1))

    mockPushOn = true
    mockToken.mockResolvedValueOnce("ExpoPushToken[phone]")
    rerender(<PushDeviceSync />)
    await waitFor(() => expect(mockSync).toHaveBeenCalled())
    await act(async () => finishForget())

    mockPushOn = false
    rerender(<PushDeviceSync />)
    await waitFor(() => expect(mockForget).toHaveBeenCalledTimes(2))
  })
})
