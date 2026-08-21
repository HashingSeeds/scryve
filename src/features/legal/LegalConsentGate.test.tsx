import { act, fireEvent, render } from "@testing-library/react-native"

import { Text } from "@/components/Text"
import { ThemeProvider } from "@/theme/context"

import { accountAcceptanceCache, deviceAcceptanceStore } from "./acceptanceStore"
import { REQUIRED_CONSENT_VERSIONS } from "./consent"
import {
  ACCOUNT_CONSENT_TIMEOUT_MS,
  AUTH_LOAD_TIMEOUT_MS,
  LegalConsentGate,
} from "./LegalConsentGate"

const mockPush = jest.fn()
let mockPathname = "/"
let mockAuth: Record<string, unknown> = { configured: false, isLoaded: true, isSignedIn: false }

jest.mock("expo-router", () => ({
  router: { push: (path: string) => mockPush(path), replace: jest.fn(), back: jest.fn() },
  usePathname: () => mockPathname,
}))
jest.mock("@/features/auth/AuthContext", () => ({ useAuthAccess: () => mockAuth }))
let mockAccountAcceptances: unknown = []
let mockConvexAuth = { isAuthenticated: true, isLoading: false }
const mockRecordAcceptance = jest.fn(async () => ({ acceptedAt: 0 }))
jest.mock("convex/react", () => ({
  useQuery: () => mockAccountAcceptances,
  useMutation: () => mockRecordAcceptance,
  useConvexAuth: () => mockConvexAuth,
}))

function renderGate(onResolved?: () => void) {
  return render(
    <ThemeProvider initialContext="light">
      <LegalConsentGate onResolved={onResolved}>
        <Text text="APP CONTENT" />
      </LegalConsentGate>
    </ThemeProvider>,
  )
}

describe("LegalConsentGate", () => {
  beforeEach(() => {
    mockPathname = "/"
    mockAuth = { configured: false, isLoaded: true, isSignedIn: false }
    mockAccountAcceptances = []
    mockConvexAuth = { isAuthenticated: true, isLoading: false }
    mockRecordAcceptance.mockClear()
    accountAcceptanceCache.write("user-a", {})
    accountAcceptanceCache.write("user-b", {})
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

  it("lets the support page be read while gated", () => {
    mockPathname = "/support"
    expect(renderGate().getByText("APP CONTENT")).toBeTruthy()
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

  it("asks a newly signed-in account even when this device already agreed", () => {
    deviceAcceptanceStore.write(REQUIRED_CONSENT_VERSIONS)
    mockAuth = { configured: true, isLoaded: true, isSignedIn: true, userId: "user-a" }
    const view = renderGate()
    expect(view.queryByText("APP CONTENT")).toBeNull()
    expect(view.getByText("Before you start")).toBeTruthy()
  })

  it("renders nothing while authentication is still loading", () => {
    mockAuth = { configured: true, isLoaded: false, isSignedIn: false }
    const onResolved = jest.fn()
    const view = renderGate(onResolved)
    expect(view.queryByText("APP CONTENT")).toBeNull()
    expect(view.queryByText("Before you start")).toBeNull()
    expect(onResolved).not.toHaveBeenCalled()
  })

  it("renders nothing while the account acceptances are still loading", () => {
    deviceAcceptanceStore.write(REQUIRED_CONSENT_VERSIONS)
    mockAuth = { configured: true, isLoaded: true, isSignedIn: true, userId: "user-a" }
    mockAccountAcceptances = undefined
    const onResolved = jest.fn()
    const view = renderGate(onResolved)
    expect(view.queryByText("APP CONTENT")).toBeNull()
    expect(onResolved).not.toHaveBeenCalled()
  })

  it("falls back to the device answer when the account cannot be reached", () => {
    jest.useFakeTimers()
    try {
      deviceAcceptanceStore.write(REQUIRED_CONSENT_VERSIONS)
      mockAuth = { configured: true, isLoaded: true, isSignedIn: true, userId: "user-a" }
      mockAccountAcceptances = undefined
      const view = renderGate()
      expect(view.queryByText("APP CONTENT")).toBeNull()
      act(() => void jest.advanceTimersByTime(ACCOUNT_CONSENT_TIMEOUT_MS))
      expect(view.getByText("APP CONTENT")).toBeTruthy()
    } finally {
      jest.useRealTimers()
    }
  })

  it("stops waiting for authentication that never loads", () => {
    jest.useFakeTimers()
    try {
      deviceAcceptanceStore.write(REQUIRED_CONSENT_VERSIONS)
      mockAuth = { configured: true, isLoaded: false, isSignedIn: false }
      const onResolved = jest.fn()
      const view = renderGate(onResolved)
      expect(view.queryByText("APP CONTENT")).toBeNull()
      act(() => void jest.advanceTimersByTime(AUTH_LOAD_TIMEOUT_MS))
      expect(view.getByText("APP CONTENT")).toBeTruthy()
      expect(onResolved).toHaveBeenCalled()
    } finally {
      jest.useRealTimers()
    }
  })

  it("reports resolution once the gate knows what to show", () => {
    const onResolved = jest.fn()
    renderGate(onResolved)
    expect(onResolved).toHaveBeenCalled()
  })

  it("lets a cached account through without waiting for the backend", () => {
    accountAcceptanceCache.write("user-a", REQUIRED_CONSENT_VERSIONS)
    mockAuth = { configured: true, isLoaded: true, isSignedIn: true, userId: "user-a" }
    mockAccountAcceptances = undefined
    const onResolved = jest.fn()
    const view = renderGate(onResolved)
    expect(view.getByText("APP CONTENT")).toBeTruthy()
    expect(onResolved).toHaveBeenCalled()
  })

  it("does not let one account's cached answer cover another account", () => {
    accountAcceptanceCache.write("user-a", REQUIRED_CONSENT_VERSIONS)
    mockAuth = { configured: true, isLoaded: true, isSignedIn: true, userId: "user-b" }
    mockAccountAcceptances = undefined
    const view = renderGate()
    expect(view.queryByText("APP CONTENT")).toBeNull()
  })

  it("prompts when the backend contradicts a stale cache", () => {
    accountAcceptanceCache.write("user-a", REQUIRED_CONSENT_VERSIONS)
    mockAuth = { configured: true, isLoaded: true, isSignedIn: true, userId: "user-a" }
    mockAccountAcceptances = [{ document: "terms", version: "1900-01-01" }]
    const view = renderGate()
    expect(view.queryByText("APP CONTENT")).toBeNull()
    expect(view.getByText("We have updated our terms")).toBeTruthy()
  })

  it("does not trust the backend answer until Convex itself is authenticated", () => {
    jest.useFakeTimers()
    try {
      accountAcceptanceCache.write("user-a", REQUIRED_CONSENT_VERSIONS)
      mockAuth = { configured: true, isLoaded: true, isSignedIn: true, userId: "user-a" }
      mockConvexAuth = { isAuthenticated: false, isLoading: true }
      mockAccountAcceptances = null
      const view = renderGate()
      act(() => void jest.advanceTimersByTime(ACCOUNT_CONSENT_TIMEOUT_MS))
      expect(view.getByText("APP CONTENT")).toBeTruthy()
    } finally {
      jest.useRealTimers()
    }
  })

  it("keeps the answer locally when the backend cannot be written to", async () => {
    jest.useFakeTimers()
    mockAuth = { configured: true, isLoaded: true, isSignedIn: true, userId: "user-a" }
    mockConvexAuth = { isAuthenticated: false, isLoading: false }
    mockAccountAcceptances = null
    const view = renderGate()
    act(() => void jest.advanceTimersByTime(ACCOUNT_CONSENT_TIMEOUT_MS))
    await act(async () => void fireEvent.press(view.getByTestId("accept-legal-button")))
    expect(mockRecordAcceptance).not.toHaveBeenCalled()
    expect(view.getByText("APP CONTENT")).toBeTruthy()
    expect(accountAcceptanceCache.read("user-a")).toEqual(REQUIRED_CONSENT_VERSIONS)
    jest.useRealTimers()
  })

  it("replays an unsynced acceptance once the backend authenticates", async () => {
    jest.useFakeTimers()
    mockAuth = { configured: true, isLoaded: true, isSignedIn: true, userId: "user-a" }
    mockConvexAuth = { isAuthenticated: false, isLoading: false }
    mockAccountAcceptances = null
    const view = renderGate()
    act(() => void jest.advanceTimersByTime(ACCOUNT_CONSENT_TIMEOUT_MS))
    await act(async () => void fireEvent.press(view.getByTestId("accept-legal-button")))
    expect(mockRecordAcceptance).not.toHaveBeenCalled()

    mockConvexAuth = { isAuthenticated: true, isLoading: false }
    mockAccountAcceptances = []
    await act(async () =>
      view.rerender(
        <ThemeProvider initialContext="light">
          <LegalConsentGate>
            <Text text="APP CONTENT" />
          </LegalConsentGate>
        </ThemeProvider>,
      ),
    )
    expect(mockRecordAcceptance).toHaveBeenCalledTimes(2)
    jest.useRealTimers()
  })

  it("caches what the backend reports so the next launch is immediate", () => {
    mockAuth = { configured: true, isLoaded: true, isSignedIn: true, userId: "user-b" }
    mockAccountAcceptances = [
      { document: "terms", version: REQUIRED_CONSENT_VERSIONS.terms },
      { document: "privacy", version: REQUIRED_CONSENT_VERSIONS.privacy },
    ]
    expect(renderGate().getByText("APP CONTENT")).toBeTruthy()
    expect(accountAcceptanceCache.read("user-b")).toEqual(REQUIRED_CONSENT_VERSIONS)
  })
})
