import { render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { ClerkAuthModal } from "./ClerkAuthModal.web"

const mockOpenSignIn = jest.fn()
jest.mock("@clerk/expo", () => ({
  useClerk: () => ({ openSignIn: mockOpenSignIn }),
}))

describe("web auth experience", () => {
  beforeEach(() => mockOpenSignIn.mockClear())

  function modal(initialContext: "light" | "dark", visible: boolean, onDismiss: () => void) {
    return (
      <ThemeProvider initialContext={initialContext}>
        <ClerkAuthModal visible={visible} onDismiss={onDismiss} />
      </ThemeProvider>
    )
  }

  it.each([
    ["light", "#F4F2F1", "#C76542"],
    ["dark", "#191015", "#E8C1B4"],
  ] as const)("opens Clerk with the %s theme and popup OAuth", (theme, background, primary) => {
    const onDismiss = jest.fn()
    const { rerender } = render(modal(theme, false, onDismiss))

    expect(mockOpenSignIn).not.toHaveBeenCalled()

    rerender(modal(theme, true, onDismiss))

    expect(mockOpenSignIn).toHaveBeenCalledWith(
      expect.objectContaining({
        withSignUp: true,
        oauthFlow: "popup",
        appearance: expect.objectContaining({
          variables: expect.objectContaining({
            colorBackground: background,
            colorPrimary: primary,
          }),
        }),
      }),
    )
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
