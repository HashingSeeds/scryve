import { router } from "expo-router"
import { renderHook } from "@testing-library/react-native"

import { useAccountEntry } from "./useAccountEntry"

let mockReceiptToken: string | undefined
const mockOpenAuth = jest.fn()

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }))
jest.mock("@/features/auth/AuthContext", () => ({
  useAuthAccess: () => ({ configured: true, isSignedIn: false, openAuth: mockOpenAuth }),
}))
jest.mock("@/features/auth/accountDeletionReceiptStore", () => ({
  loadAccountDeletionReceiptToken: () => mockReceiptToken,
}))

describe("useAccountEntry while signed out", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockReceiptToken = undefined
  })

  it("signs in without a deletion receipt", () => {
    const { result } = renderHook(() => useAccountEntry())
    result.current.onAccount()
    expect(result.current.accountEntry).toBe("signIn")
    expect(mockOpenAuth).toHaveBeenCalled()
  })

  it("opens the account page with a deletion receipt", () => {
    mockReceiptToken = "e".repeat(64)
    const { result } = renderHook(() => useAccountEntry())
    result.current.onAccount()
    expect(result.current.accountEntry).toBe("account")
    expect(router.push).toHaveBeenCalledWith("/account")
  })
})
