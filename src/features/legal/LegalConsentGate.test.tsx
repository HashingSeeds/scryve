import { fireEvent, render } from "@testing-library/react-native"

import { Text } from "@/components/Text"
import { ThemeProvider } from "@/theme/context"

import { deviceAcceptanceStore } from "./acceptanceStore"
import { REQUIRED_CONSENT_VERSIONS } from "./consent"
import { LegalConsentGate } from "./LegalConsentGate"

const mockPush = jest.fn()
let mockPathname = "/"
let mockAuth = { configured: false, isLoaded: true, isSignedIn: false }

jest.mock("expo-router", () => ({
  router: { push: (path: string) => mockPush(path), replace: jest.fn(), back: jest.fn() },
  usePathname: () => mockPathname,
}))
jest.mock("@/features/auth/AuthContext", () => ({ useAuthAccess: () => mockAuth }))
jest.mock("convex/react", () => ({ useQuery: () => [], useMutation: () => jest.fn() }))

function renderGate() {
  return render(
    <ThemeProvider initialContext="light">
      <LegalConsentGate>
        <Text text="APP CONTENT" />
      </LegalConsentGate>
    </ThemeProvider>,
  )
}

describe("LegalConsentGate", () => {
  beforeEach(() => {
    mockPathname = "/"
    mockAuth = { configured: false, isLoaded: true, isSignedIn: false }
    mockPush.mockClear()
    deviceAcceptanceStore.write({})
  })

  it("blocks the app until the current versions are accepted", () => {
    const view = renderGate()
    expect(view.queryByText("APP CONTENT")).toBeNull()
    expect(view.getByText("Before you start")).toBeTruthy()
  })

  it("lets the app through once accepted, and remembers it", () => {
    const first = renderGate()
    fireEvent.press(first.getByTestId("accept-legal-button"))
    expect(first.getByText("APP CONTENT")).toBeTruthy()
    expect(deviceAcceptanceStore.read()).toEqual(REQUIRED_CONSENT_VERSIONS)
    expect(renderGate().getByText("APP CONTENT")).toBeTruthy()
  })

  it("prompts again when a document version changes", () => {
    deviceAcceptanceStore.write({ ...REQUIRED_CONSENT_VERSIONS, terms: "1900-01-01" })
    const view = renderGate()
    expect(view.queryByText("APP CONTENT")).toBeNull()
    expect(view.getByText("We have updated our terms")).toBeTruthy()
  })

  it("lets the legal documents themselves be read while gated", () => {
    mockPathname = "/terms"
    expect(renderGate().getByText("APP CONTENT")).toBeTruthy()
    mockPathname = "/privacy"
    expect(renderGate().getByText("APP CONTENT")).toBeTruthy()
    mockPathname = "/cookie-policy"
    expect(renderGate().getByText("APP CONTENT")).toBeTruthy()
  })

  it("opens the documents from the prompt", () => {
    const view = renderGate()
    fireEvent.press(view.getByText("Read the Terms of Use"))
    fireEvent.press(view.getByText("Read the Privacy Policy"))
    expect(mockPush).toHaveBeenCalledWith("/terms")
    expect(mockPush).toHaveBeenCalledWith("/privacy")
  })

  it("checks the account scope when signed in", () => {
    deviceAcceptanceStore.write(REQUIRED_CONSENT_VERSIONS)
    mockAuth = { configured: true, isLoaded: true, isSignedIn: true }
    const view = renderGate()
    expect(view.queryByText("APP CONTENT")).toBeNull()
    expect(view.getByText("We have updated our terms")).toBeTruthy()
  })
})
