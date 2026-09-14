import { render } from "@testing-library/react-native"

import { AccountDeletionSessionGuard } from "./AccountDeletionSessionGuard"

const mockSignOut = jest.fn(async () => undefined)
const mockSaveReceiptToken = jest.fn((_token: string) => true)
const mockResetAnalyticsId = jest.fn(() => "analytics-id")
let mockAuth = { configured: true, isLoaded: true, isSignedIn: true }
let mockDeletion: { status: string; receiptToken?: string } | null | undefined = null

jest.mock("@clerk/expo", () => ({
  useClerk: () => ({ signOut: (...args: []) => mockSignOut(...args) }),
}))
jest.mock("convex/react", () => ({
  useQuery: () => mockDeletion,
}))
jest.mock("@/features/auth/AuthContext", () => ({
  useAuthAccess: () => mockAuth,
}))
jest.mock("@/features/auth/accountDeletionReceiptStore", () => ({
  isValidReceiptToken: (token: string) => /^[0-9a-f]{64}$/.test(token),
  saveAccountDeletionReceiptToken: (...args: [string]) => mockSaveReceiptToken(...args),
}))
jest.mock("@/features/game/localPersistence", () => ({
  LocalGameRepository: jest.fn(() => ({ resetAnalyticsId: mockResetAnalyticsId })),
}))

describe("AccountDeletionSessionGuard", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuth = { configured: true, isLoaded: true, isSignedIn: true }
    mockDeletion = null
  })

  it("signs out and keeps the receipt when another device starts deletion", () => {
    mockDeletion = { status: "processing", receiptToken: "f".repeat(64) }

    const view = render(<AccountDeletionSessionGuard />)

    expect(view.toJSON()).toBeNull()
    expect(mockSaveReceiptToken).toHaveBeenCalledWith("f".repeat(64))
    expect(mockResetAnalyticsId).toHaveBeenCalledTimes(1)
    expect(mockSignOut).toHaveBeenCalledTimes(1)
  })

  it("stays signed in when nothing is being deleted", () => {
    mockDeletion = null

    render(<AccountDeletionSessionGuard />)

    expect(mockSignOut).not.toHaveBeenCalled()
    expect(mockSaveReceiptToken).not.toHaveBeenCalled()
  })

  it("stays signed in for a failed deletion so it can be retried", () => {
    mockDeletion = { status: "failed", receiptToken: "f".repeat(64) }

    render(<AccountDeletionSessionGuard />)

    expect(mockSignOut).not.toHaveBeenCalled()
  })

  it("renders nothing when auth is not configured", () => {
    mockAuth = { configured: false, isLoaded: true, isSignedIn: false }

    const view = render(<AccountDeletionSessionGuard />)

    expect(view.toJSON()).toBeNull()
    expect(mockSignOut).not.toHaveBeenCalled()
  })
})
