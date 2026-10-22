import { router } from "expo-router"
import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import AccountRoute from "../src/app/account"

let mockReceiptToken: string | undefined

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), dismissTo: jest.fn(), push: jest.fn(), replace: jest.fn() },
}))
jest.mock("@/features/auth/AccountControls", () => ({ AccountProfile: () => null }))
jest.mock("@/features/billing/SubscriptionControls", () => ({ SubscriptionControls: () => null }))
jest.mock("@/features/auth/AuthContext", () => ({
  useAuthAccess: () => ({
    configured: true,
    isLoaded: true,
    isSignedIn: false,
    openAuth: jest.fn(),
  }),
}))
jest.mock("@/features/auth/accountDeletionReceiptStore", () => ({
  loadAccountDeletionReceiptToken: () => mockReceiptToken,
}))

const renderRoute = () =>
  render(
    <ThemeProvider>
      <AccountRoute />
    </ThemeProvider>,
  )

describe("account route while signed out", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockReceiptToken = undefined
  })

  it("hides account data without a deletion receipt", () => {
    expect(renderRoute().queryByTestId("account-data-button")).toBeNull()
  })

  it("opens the deletion receipt from account data", () => {
    mockReceiptToken = "e".repeat(64)
    fireEvent.press(renderRoute().getByTestId("account-data-button"))
    expect(router.push).toHaveBeenCalledWith("/delete-account")
  })
})
