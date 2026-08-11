import type { ReactNode } from "react"
import { Pressable } from "react-native"
import { fireEvent, render, screen } from "@testing-library/react-native"

import { Text } from "@/components/Text"
import { ThemeProvider } from "@/theme/context"

import { ConfiguredAuth, useAuthAccess } from "./AuthContext"

const mockUseAuth = jest.fn((_options?: unknown) => ({ isLoaded: true, isSignedIn: false }))
const mockUseUser = jest.fn(() => ({ user: { id: "user_test" } }))
jest.mock("react-native/Libraries/Modal/Modal", () => {
  const React = jest.requireActual("react")
  const NativeView = jest.requireActual("react-native").View
  const MockModal = ({ children, ...props }: { children: ReactNode }) =>
    React.createElement(NativeView, props, children)
  return { __esModule: true, default: MockModal }
})
jest.mock("@clerk/expo", () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: (options: unknown) => mockUseAuth(options),
  useUser: () => mockUseUser(),
}))
jest.mock("@clerk/expo/token-cache", () => ({ tokenCache: {} }))
jest.mock("@clerk/expo/native", () => {
  const NativeText = jest.requireActual("react-native").Text
  return { AuthView: () => <NativeText testID="native-auth-view">Auth</NativeText> }
})
jest.mock("convex/react", () => ({ ConvexReactClient: jest.fn() }))
jest.mock("convex/react-clerk", () => ({
  ConvexProviderWithClerk: ({ children }: { children: ReactNode }) => children,
}))
jest.mock("@/features/billing/RevenueCatContext", () => ({
  RevenueCatProvider: ({ children }: { children: ReactNode }) => children,
}))

function Harness() {
  const auth = useAuthAccess()
  return (
    <Pressable testID="open-auth" onPress={auth.openAuth}>
      <Text text="Open" />
    </Pressable>
  )
}

describe("native auth experience", () => {
  it("keeps AuthView mounted while the modal is hidden and preserves pending sessions", () => {
    render(
      <ThemeProvider initialContext="light">
        <ConfiguredAuth convexUrl="https://example.convex.cloud">
          <Harness />
        </ConfiguredAuth>
      </ThemeProvider>,
    )
    expect(screen.getByTestId("native-auth-view")).toBeTruthy()
    expect(screen.getByTestId("auth-modal").props.visible).toBe(false)
    expect(mockUseAuth).toHaveBeenCalledWith({ treatPendingAsSignedOut: false })
    fireEvent.press(screen.getByTestId("open-auth"))
    expect(screen.getByTestId("auth-modal").props.visible).toBe(true)
  })
})
