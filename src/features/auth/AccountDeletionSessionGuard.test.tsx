import { render } from "@testing-library/react-native"

import { AccountDeletionSessionGuard } from "./AccountDeletionSessionGuard"

const mockSignOut = jest.fn(async () => undefined)
const mockWriteSessionHint = jest.fn()
jest.mock("@/features/auth/sessionHint", () => ({
  writeSessionHint: (hint: unknown) => mockWriteSessionHint(hint),
}))
const mockSaveReceiptToken = jest.fn((_token: string) => true)
const mockResetAnalyticsId = jest.fn(() => "analytics-id")
let mockAuth = { configured: true, isLoaded: true, isSignedIn: true }
let mockLoadedReceiptToken: string | undefined = undefined
let mockDeletion: { status: string; receiptToken?: string } | Error | null | undefined = null

jest.mock("@clerk/expo", () => ({
  useClerk: () => ({ signOut: (...args: []) => mockSignOut(...args) }),
}))
jest.mock("convex/react", () => ({
  useQuery_experimental: () =>
    mockDeletion instanceof Error
      ? { status: "error", error: mockDeletion }
      : mockDeletion === undefined
        ? { status: "pending" }
        : { status: "success", data: mockDeletion },
}))
jest.mock("@/features/auth/AuthContext", () => ({
  useAuthAccess: () => mockAuth,
}))
jest.mock("@/features/auth/accountDeletionReceiptStore", () => ({
  isValidReceiptToken: (token: string) => /^[0-9a-f]{64}$/.test(token),
  loadAccountDeletionReceiptToken: () => mockLoadedReceiptToken,
  saveAccountDeletionReceiptToken: (...args: [string]) => mockSaveReceiptToken(...args),
}))
jest.mock("@/features/game/localPersistence", () => ({
  LocalGameRepository: jest.fn(() => ({ resetAnalyticsId: mockResetAnalyticsId })),
}))

describe("AccountDeletionSessionGuard", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuth = { configured: true, isLoaded: true, isSignedIn: true }
    mockLoadedReceiptToken = undefined
    mockDeletion = null
  })

  it("signs out and keeps the receipt when another device starts deletion", () => {
    mockDeletion = { status: "processing", receiptToken: "f".repeat(64) }

    const view = render(<AccountDeletionSessionGuard />)

    expect(view.toJSON()).toBeNull()
    expect(mockSaveReceiptToken).toHaveBeenCalledWith("f".repeat(64))
    expect(mockResetAnalyticsId).toHaveBeenCalledTimes(1)
    expect(mockSignOut).toHaveBeenCalledTimes(1)
    expect(mockWriteSessionHint).toHaveBeenCalledWith({ userId: null })
  })

  it("rotates once when the receipt is already saved", () => {
    mockLoadedReceiptToken = "f".repeat(64)
    mockDeletion = { status: "processing", receiptToken: "f".repeat(64) }

    render(<AccountDeletionSessionGuard />)

    expect(mockResetAnalyticsId).not.toHaveBeenCalled()
    expect(mockSaveReceiptToken).not.toHaveBeenCalled()
    expect(mockSignOut).toHaveBeenCalledTimes(1)
  })

  it.each([
    ["nothing is being deleted", null],
    ["the deletion check fails", new Error("Server Error")],
    ["a deletion failed and can be retried", { status: "failed", receiptToken: "f".repeat(64) }],
  ])("stays signed in when %s", (_case, deletion) => {
    mockDeletion = deletion

    render(<AccountDeletionSessionGuard />)

    expect(mockSignOut).not.toHaveBeenCalled()
    expect(mockSaveReceiptToken).not.toHaveBeenCalled()
  })

  it("renders nothing when auth is not configured", () => {
    mockAuth = { configured: false, isLoaded: true, isSignedIn: false }

    const view = render(<AccountDeletionSessionGuard />)

    expect(view.toJSON()).toBeNull()
    expect(mockSignOut).not.toHaveBeenCalled()
  })
})
