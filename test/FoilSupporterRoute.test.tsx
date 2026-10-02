import { act, fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import FoilSupporterRoute from "../src/app/foil-supporter.web"

const mockOpenAuth = jest.fn()
const mockPurchase = jest.fn().mockResolvedValue({ status: "purchased" })
const mockBilling = {
  configured: true,
  isLoading: false,
  isCountPro: false,
  purchase: mockPurchase,
  presentCustomerCenter: jest.fn(),
}
let mockSignedIn = false

jest.mock("expo-router", () => ({ router: { replace: jest.fn() } }))
jest.mock("expo-router/head", () => ({ __esModule: true, default: () => null }))
jest.mock("@/features/auth/AuthContext", () => ({
  useAuthAccess: () => ({
    configured: true,
    isLoaded: true,
    isSignedIn: mockSignedIn,
    openAuth: mockOpenAuth,
  }),
}))
jest.mock("@/features/billing/RevenueCatContext", () => ({ useRevenueCat: () => mockBilling }))

function renderRoute() {
  return render(
    <ThemeProvider initialContext="dark">
      <FoilSupporterRoute />
    </ThemeProvider>,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  mockSignedIn = false
  mockBilling.isCountPro = false
})

it("requires sign-in before opening Foil checkout", () => {
  const view = renderRoute()
  expect(view.queryByText("Choose Foil Supporter")).toBeNull()
  fireEvent.press(view.getByText("Sign in"))
  expect(mockOpenAuth).toHaveBeenCalledTimes(1)
  expect(mockPurchase).not.toHaveBeenCalled()
})

it("opens Foil checkout for a signed-in free player", async () => {
  mockSignedIn = true
  const view = renderRoute()
  await act(async () => fireEvent.press(view.getByText("Choose Foil Supporter")))
  expect(mockPurchase).toHaveBeenCalledWith("foil_yearly")
})
