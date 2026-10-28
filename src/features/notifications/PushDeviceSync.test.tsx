import { render, waitFor } from "@testing-library/react-native"

import { storage } from "@/utils/storage"

import { PushDeviceSync } from "./PushDeviceSync"

const mockSync = jest.fn()
const mockForget = jest.fn()
const mockToken = jest.fn<Promise<string | null>, []>()

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
jest.mock("./prefs", () => ({ usePushPref: () => true }))
jest.mock("./device", () => ({
  pushSupported: true,
  pushToken: () => mockToken(),
  onNotificationOpened: () => () => undefined,
}))

describe("PushDeviceSync", () => {
  beforeEach(() => storage.clearAll())

  it("forgets a registered device once notifications are off in system settings", async () => {
    mockToken.mockResolvedValueOnce("ExpoPushToken[phone]")
    const { unmount } = render(<PushDeviceSync />)
    await waitFor(() => expect(mockSync).toHaveBeenCalled())
    unmount()

    mockToken.mockResolvedValueOnce(null)
    render(<PushDeviceSync />)
    await waitFor(() => expect(mockForget).toHaveBeenCalledWith({ key: "key" }))
  })
})
