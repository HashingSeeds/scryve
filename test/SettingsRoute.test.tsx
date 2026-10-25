import { render, screen } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import SettingsRoute from "../src/app/settings"
import BlockedPlayersRoute from "../src/app/settings/blocked-players"

jest.mock("expo-router", () => {
  const { Text } = jest.requireActual("react-native")
  return {
    router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
    Redirect: ({ href }: { href: string }) => <Text>{`redirect:${href}`}</Text>,
  }
})

const mockAuthAccess = {
  configured: false,
  isLoaded: true,
  isSignedIn: false,
  openAuth: jest.fn(),
  closeAuth: jest.fn(),
}

jest.mock("@/features/auth/AuthContext", () => ({
  useAuthAccess: () => mockAuthAccess,
}))

jest.mock("convex/react", () => ({
  useConvexAuth: () => {
    if (!mockAuthAccess.configured) throw new Error("Could not find `ConvexProviderWithClerk`")
    return { isAuthenticated: mockAuthAccess.isSignedIn, isLoading: false }
  },
  useQuery: () => [],
  useMutation: () => jest.fn(),
}))

jest.mock("../convex/_generated/api", () => ({
  api: { moderation: { myBlocks: "moderation.myBlocks", unblockPlayer: "moderation.unblock" } },
}))

function renderSettings() {
  return render(
    <ThemeProvider initialContext="light">
      <SettingsRoute />
    </ThemeProvider>,
  )
}

describe("settings route", () => {
  beforeEach(() => {
    mockAuthAccess.configured = false
    mockAuthAccess.isSignedIn = false
  })

  it("opens for a signed-out player instead of failing on a cloud-only section", () => {
    renderSettings()
    expect(screen.getByText("Local game defaults")).toBeTruthy()
    expect(screen.queryByText("Blocked players")).toBeNull()
  })

  it("opens when cloud is configured but nobody is signed in", () => {
    mockAuthAccess.configured = true
    renderSettings()
    expect(screen.getByText("Local game defaults")).toBeTruthy()
    expect(screen.queryByText("Blocked players")).toBeNull()
  })

  it("shows blocked players once there is a signed-in cloud session", () => {
    mockAuthAccess.configured = true
    mockAuthAccess.isSignedIn = true
    renderSettings()
    expect(screen.getByText("Blocked players")).toBeTruthy()
  })

  it("sends a direct blocked players visit without a cloud session back to Settings", () => {
    render(
      <ThemeProvider initialContext="light">
        <BlockedPlayersRoute />
      </ThemeProvider>,
    )
    expect(screen.getByText("redirect:/settings")).toBeTruthy()
  })
})
