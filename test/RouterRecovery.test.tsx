import { fireEvent, render } from "@testing-library/react-native"

import { Screen } from "@/components/Screen"
import { ThemeProvider } from "@/theme/context"

import AccountRoute from "../src/app/account"
import InviteRoute from "../src/app/join/[token]"

const mockOpenAuth = jest.fn()
const mockToken = "bad"
let mockIsSignedIn = false

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: jest.fn(() => true), replace: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ token: mockToken }),
}))
jest.mock("@/features/auth/AuthContext", () => ({
  useAuthAccess: () => ({
    configured: true,
    isSignedIn: mockIsSignedIn,
    openAuth: mockOpenAuth,
    configurationMessage: undefined,
  }),
}))
jest.mock("@/features/auth/AccountControls", () => {
  const { View } = jest.requireActual("react-native")
  return {
    AccountProfile: ({ onBack }: { onBack: () => void }) => (
      <View testID="account-profile" onTouchEnd={onBack} />
    ),
  }
})
jest.mock("@/features/connected/ConnectedGate", () => ({
  ConnectedGate: ({ children }: { children: React.ReactNode }) => children,
}))
jest.mock("@/screens/JoinConnectedScreen", () => ({ JoinConnectedScreen: () => null }))

function themed(element: React.ReactElement) {
  return <ThemeProvider initialContext="light">{element}</ThemeProvider>
}

describe("Router recovery fallbacks", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockIsSignedIn = false
  })

  it("offers re-authentication and home recovery from a rejected account route", () => {
    const view = render(themed(<AccountRoute />))
    fireEvent.press(view.getByText("Re-authenticate"))
    fireEvent.press(view.getByText("Return home"))
    expect(mockOpenAuth).toHaveBeenCalledTimes(1)
    expect(jest.requireMock("expo-router").router.replace).toHaveBeenCalledWith("/")
  })

  it("offers manual-code and home recovery for an invalid deep link", () => {
    const view = render(themed(<InviteRoute />))
    fireEvent.press(view.getByText("Enter a manual code"))
    fireEvent.press(view.getByText("Return home"))
    const replace = jest.requireMock("expo-router").router.replace
    expect(replace).toHaveBeenNthCalledWith(1, "/connected/join")
    expect(replace).toHaveBeenNthCalledWith(2, "/")
  })

  it("gives the signed-in account profile the remaining route height", () => {
    mockIsSignedIn = true
    const view = render(themed(<AccountRoute />))
    expect(view.getByTestId("account-profile")).toBeTruthy()
    expect(view.UNSAFE_getByType(Screen).props.contentContainerStyle).toEqual({ flex: 1 })
  })

  it("opens account deletion from the signed-in account screen", () => {
    mockIsSignedIn = true
    const view = render(themed(<AccountRoute />))

    fireEvent.press(view.getByLabelText("Account and data"))

    expect(jest.requireMock("expo-router").router.push).toHaveBeenCalledWith("/delete-account")
  })
})
