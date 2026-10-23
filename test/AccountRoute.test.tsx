import { router } from "expo-router"
import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import AccountRoute from "../src/app/account"

let mockReceiptToken: string | undefined
let mockSigningOut = false
const mockSetSigningOut = jest.fn()

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
    signingOut: mockSigningOut,
    setSigningOut: mockSetSigningOut,
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

beforeEach(() => {
  jest.clearAllMocks()
  mockReceiptToken = undefined
  mockSigningOut = false
})

describe("account route while signed out", () => {
  it("hides account data without a deletion receipt", () => {
    expect(renderRoute().queryByTestId("account-data-button")).toBeNull()
  })

  it("opens the deletion receipt from account data", () => {
    mockReceiptToken = "e".repeat(64)
    fireEvent.press(renderRoute().getByTestId("account-data-button"))
    expect(router.push).toHaveBeenCalledWith("/delete-account")
  })
})

describe("account route after signing out here", () => {
  it("leaves for Play without flashing the sign-in prompt", () => {
    mockSigningOut = true
    const view = renderRoute()

    expect(view.queryByText("Sign in before opening your profile.")).toBeNull()
    expect(router.dismissTo).toHaveBeenCalledWith("/")
    expect(mockSetSigningOut).not.toHaveBeenCalled()
  })

  it("clears the sign-out once the screen is gone so later visits stay", () => {
    mockSigningOut = true
    renderRoute().unmount()

    expect(mockSetSigningOut).toHaveBeenCalledWith(false)
  })
})
