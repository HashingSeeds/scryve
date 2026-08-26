import { router } from "expo-router"
import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import DeleteAccountRoute, { ErrorBoundary } from "../src/app/delete-account"

let mockReceiptToken: string | undefined
let mockReceipt:
  | {
      status: "completed" | "failed" | "processing" | "identity_pending"
      requestedAt: number
      updatedAt: number
      canRetry: boolean
    }
  | null
  | undefined
const mockOpenAuth = jest.fn()

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), replace: jest.fn() },
}))
jest.mock("@clerk/expo", () => ({ useUser: jest.fn() }))
jest.mock("convex/react", () => ({
  useConvexAuth: jest.fn(),
  useMutation: jest.fn(),
  useQuery: jest.fn(() => mockReceipt),
}))
jest.mock("@/features/auth/AuthContext", () => ({
  useAuthAccess: () => ({
    configured: true,
    isLoaded: true,
    isSignedIn: false,
    openAuth: mockOpenAuth,
  }),
}))
jest.mock("@/features/auth/accountDeletionReceiptStore", () => ({
  loadAccountDeletionReceiptToken: () => mockReceiptToken,
  saveAccountDeletionReceiptToken: jest.fn(() => true),
  clearAccountDeletionReceiptToken: jest.fn(),
}))

describe("delete account route", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockReceiptToken = undefined
    mockReceipt = undefined
  })

  it("contains query failures and offers a scoped retry", () => {
    const retry = jest.fn().mockResolvedValue(undefined)
    const view = render(
      <ThemeProvider initialContext="dark">
        <ErrorBoundary error={new Error("Query failed")} retry={retry} />
      </ThemeProvider>,
    )

    expect(view.getByRole("alert")).toHaveTextContent(
      /Account deletion stays unavailable until the check succeeds\./,
    )
    expect(view.queryByTestId("confirm-account-deletion-button")).toBeNull()
    fireEvent.press(view.getByText("Try again"))
    expect(retry).toHaveBeenCalledTimes(1)
    fireEvent.press(view.getByText("Return home"))
    expect(router.replace).toHaveBeenCalledWith("/")
  })

  it("restores a completed receipt after the identity is gone and the app restarts", () => {
    mockReceiptToken = "a".repeat(64)
    mockReceipt = {
      status: "completed",
      requestedAt: Date.UTC(2026, 7, 23, 18, 40),
      updatedAt: Date.UTC(2026, 7, 23, 18, 45),
      canRetry: false,
    }

    const view = render(
      <ThemeProvider initialContext="dark">
        <DeleteAccountRoute />
      </ThemeProvider>,
    )

    expect(view.getByText("Your account was deleted")).toBeTruthy()
    expect(view.queryByText("Sign in")).toBeNull()
  })

  it("lets a signed-out user sign in when the durable receipt needs attention", () => {
    mockReceiptToken = "b".repeat(64)
    mockReceipt = {
      status: "failed",
      requestedAt: Date.UTC(2026, 7, 23, 18, 40),
      updatedAt: Date.UTC(2026, 7, 23, 18, 45),
      canRetry: true,
    }

    const view = render(
      <ThemeProvider initialContext="dark">
        <DeleteAccountRoute />
      </ThemeProvider>,
    )

    fireEvent.press(view.getByText("Sign in to retry"))
    expect(mockOpenAuth).toHaveBeenCalledTimes(1)
  })
})
