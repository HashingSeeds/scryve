import { fireEvent, render } from "@testing-library/react-native"

import { Screen } from "@/components/Screen"
import { ThemeProvider } from "@/theme/context"

import AccountRoute from "../src/app/account"
import HistoryRoute from "../src/app/history"
import GameSummaryRoute from "../src/app/history/[gameId]"
import InviteRoute from "../src/app/join/[token]"

const mockOpenAuth = jest.fn()
const mockToken = "bad"
let mockIsSignedIn = false

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: jest.fn(() => true), replace: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ token: mockToken }),
  useFocusEffect: jest.fn(),
}))
jest.mock("@/features/async/ConvexQueryBoundary", () => ({ ConvexQueryBoundary: () => null }))
jest.mock("@/features/connected/ConnectedGate", () => ({ ConnectedGate: () => null }))
jest.mock("@/features/connected/ConnectedSummarySource", () => ({
  ConnectedSummarySource: () => null,
}))
jest.mock("@/features/game/localPersistence", () => ({
  localGameRepository: { loadHistory: () => [], loadHistoryDetail: () => null },
}))
jest.mock("@/screens/GameSummaryScreen", () => {
  const { TouchableOpacity } = jest.requireActual("react-native")
  return {
    GameSummaryScreen: ({ onBack }: { onBack: () => void }) => (
      <TouchableOpacity accessibilityLabel="Back" onPress={onBack} />
    ),
  }
})
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
    AccountProfile: ({
      onBack,
      accountControls,
    }: {
      onBack: () => void
      accountControls?: React.ReactNode
    }) => (
      <View testID="account-profile" onTouchEnd={onBack}>
        {accountControls}
      </View>
    ),
  }
})
jest.mock("@/features/auth/CloudScreen", () => ({
  CloudScreen: ({ children }: { children: () => React.ReactNode }) => children(),
}))
jest.mock("@/screens/JoinConnectedScreen", () => ({ JoinConnectedScreen: () => null }))
jest.mock("@/screens/HistoryScreen", () => {
  const { TouchableOpacity } = jest.requireActual("react-native")
  return {
    HistoryScreen: ({ onBack }: { onBack: () => void }) => (
      <TouchableOpacity accessibilityLabel="Back" onPress={onBack} />
    ),
  }
})

function themed(element: React.ReactElement) {
  return <ThemeProvider initialContext="light">{element}</ThemeProvider>
}

describe("Router recovery fallbacks", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.requireMock("expo-router").router.canGoBack.mockReturnValue(true)
    mockIsSignedIn = false
  })

  it("offers re-authentication and home recovery from a rejected account route", () => {
    const view = render(themed(<AccountRoute />))
    fireEvent.press(view.getByText("Re-authenticate"))
    fireEvent.press(view.getByText("Open Play"))
    expect(mockOpenAuth).toHaveBeenCalledTimes(1)
    expect(jest.requireMock("expo-router").router.replace).toHaveBeenCalledWith({
      pathname: "/",
      params: { destination: "play" },
    })
  })

  it("offers manual-code and home recovery for an invalid deep link", () => {
    const view = render(themed(<InviteRoute />))
    fireEvent.press(view.getByText("Enter a manual code"))
    fireEvent.press(view.getByText("Open Play"))
    const replace = jest.requireMock("expo-router").router.replace
    expect(replace).toHaveBeenNthCalledWith(1, "/connected/join")
    expect(replace).toHaveBeenNthCalledWith(2, {
      pathname: "/",
      params: { destination: "play" },
    })
  })

  it("returns a root game summary to Play when there is no route to go back to", () => {
    const router = jest.requireMock("expo-router").router
    router.canGoBack.mockReturnValue(false)
    const view = render(themed(<GameSummaryRoute />))

    fireEvent.press(view.getByLabelText("Back"))

    expect(router.back).not.toHaveBeenCalled()
    expect(router.replace).toHaveBeenCalledWith({
      pathname: "/",
      params: { destination: "play" },
    })
  })

  it("returns a game summary to its existing route stack", () => {
    const router = jest.requireMock("expo-router").router
    const view = render(themed(<GameSummaryRoute />))

    fireEvent.press(view.getByLabelText("Back"))

    expect(router.back).toHaveBeenCalledTimes(1)
    expect(router.replace).not.toHaveBeenCalled()
  })

  it("returns a root history list to Play when there is no route to go back to", () => {
    const router = jest.requireMock("expo-router").router
    router.canGoBack.mockReturnValue(false)
    const view = render(themed(<HistoryRoute />))

    fireEvent.press(view.getByLabelText("Back"))

    expect(router.back).not.toHaveBeenCalled()
    expect(router.replace).toHaveBeenCalledWith({
      pathname: "/",
      params: { destination: "play" },
    })
  })

  it("returns a history list to its existing route stack", () => {
    const router = jest.requireMock("expo-router").router
    const view = render(themed(<HistoryRoute />))

    fireEvent.press(view.getByLabelText("Back"))

    expect(router.back).toHaveBeenCalledTimes(1)
    expect(router.replace).not.toHaveBeenCalled()
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
