import type { ReactNode } from "react"
import {
  Pressable,
  // Test harness is outside the app theme provider.
  // eslint-disable-next-line no-restricted-imports
  Text,
} from "react-native"
import { fireEvent, render, screen } from "@testing-library/react-native"

import { ConfiguredAuth, useAuthAccess } from "./AuthContext"

const mockUseAuth = jest.fn((_options?: unknown) => ({ isLoaded: true, isSignedIn: false }))
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

function Harness() {
  const auth = useAuthAccess()
  return (
    <Pressable testID="open-auth" onPress={auth.openAuth}>
      <Text>Open</Text>
    </Pressable>
  )
}

describe("native auth experience", () => {
  it("keeps AuthView mounted while the modal is hidden and preserves pending sessions", () => {
    render(
      <ConfiguredAuth convexUrl="https://example.convex.cloud">
        <Harness />
      </ConfiguredAuth>,
    )
    expect(screen.getByTestId("native-auth-view")).toBeTruthy()
    expect(screen.getByTestId("auth-modal").props.visible).toBe(false)
    expect(mockUseAuth).toHaveBeenCalledWith({ treatPendingAsSignedOut: false })
    fireEvent.press(screen.getByTestId("open-auth"))
    expect(screen.getByTestId("auth-modal").props.visible).toBe(true)
  })
})
