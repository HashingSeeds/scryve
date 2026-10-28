import { render } from "@testing-library/react-native"

import { AccountLegalAcceptance } from "./AccountLegalAcceptance"
import { REQUIRED_CONSENT_VERSIONS } from "./consent"

const mockRecord = jest.fn(() => Promise.resolve({ acceptedAt: 1 }))
let mockAcceptances: Array<{ document: string; version: string }> | undefined

jest.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true }),
  useQuery: () => mockAcceptances,
  useMutation: () => mockRecord,
}))
jest.mock("../../../convex/_generated/api", () => ({
  api: { legal: { currentAcceptances: "current", recordAcceptance: "record" } },
}))
jest.mock("@/features/auth/AuthContext", () => ({
  useAuthAccess: () => ({ configured: true, userId: "user_a" }),
}))

describe("AccountLegalAcceptance", () => {
  beforeEach(() => jest.clearAllMocks())

  it("records the current versions for a new account", () => {
    mockAcceptances = []
    render(<AccountLegalAcceptance />)
    expect(mockRecord).toHaveBeenCalledTimes(2)
    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        document: "terms",
        version: REQUIRED_CONSENT_VERSIONS.terms,
        intendedAccount: "user_a",
      }),
    )
  })

  it("leaves an account's earlier agreement as it was", () => {
    mockAcceptances = [
      { document: "terms", version: "2026-08-18" },
      { document: "privacy", version: "2026-08-18" },
    ]
    render(<AccountLegalAcceptance />)
    expect(mockRecord).not.toHaveBeenCalled()
  })
})
