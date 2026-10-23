import { router } from "expo-router"
import { act, fireEvent, render } from "@testing-library/react-native"

import type { AccountProfileProps } from "@/features/auth/accountProfileProps"
import { ThemeProvider } from "@/theme/context"

import AccountRoute from "../src/app/account"

let mockReceiptToken: string | undefined
let mockIsSignedIn = false
let mockProfileProps: AccountProfileProps | undefined

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), dismissTo: jest.fn(), push: jest.fn(), replace: jest.fn() },
}))
jest.mock("@/features/auth/AccountControls", () => ({
  AccountProfile: (props: AccountProfileProps) => {
    mockProfileProps = props
    return null
  },
}))
jest.mock("@/features/billing/SubscriptionControls", () => ({ SubscriptionControls: () => null }))
jest.mock("@/features/auth/AuthContext", () => ({
  useAuthAccess: () => ({
    configured: true,
    isLoaded: true,
    isSignedIn: mockIsSignedIn,
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
    mockIsSignedIn = false
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

describe("account route while signing out", () => {
  it("keeps the profile up after Clerk drops the session", () => {
    mockIsSignedIn = true
    const view = renderRoute()
    act(() => mockProfileProps?.onSigningOut?.(true))

    mockIsSignedIn = false
    view.rerender(
      <ThemeProvider>
        <AccountRoute />
      </ThemeProvider>,
    )

    expect(view.queryByText("Sign in before opening your profile.")).toBeNull()
  })
})
