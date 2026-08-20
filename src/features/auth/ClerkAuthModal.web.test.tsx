import { render } from "@testing-library/react-native"

import { ClerkAuthModal } from "./ClerkAuthModal.web"

const mockOpenSignIn = jest.fn()
jest.mock("@clerk/expo", () => ({
  useClerk: () => ({ openSignIn: mockOpenSignIn }),
}))

describe("web auth experience", () => {
  beforeEach(() => mockOpenSignIn.mockClear())

  it("opens Clerk's virtual modal with Scryve styling and popup OAuth", () => {
    const onDismiss = jest.fn()
    const { rerender } = render(<ClerkAuthModal visible={false} onDismiss={onDismiss} />)

    expect(mockOpenSignIn).not.toHaveBeenCalled()

    rerender(<ClerkAuthModal visible onDismiss={onDismiss} />)

    expect(mockOpenSignIn).toHaveBeenCalledWith(
      expect.objectContaining({
        withSignUp: true,
        oauthFlow: "popup",
        appearance: expect.objectContaining({
          variables: expect.objectContaining({
            colorBackground: "#191015",
            colorPrimary: "#E8C1B4",
          }),
        }),
      }),
    )
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
