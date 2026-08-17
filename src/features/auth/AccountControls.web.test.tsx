import { fireEvent, render, waitFor } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { AccountProfile } from "./AccountControls.web"

const mockOpenUserProfile = jest.fn()

jest.mock("@clerk/expo", () => ({
  useClerk: () => ({ openUserProfile: mockOpenUserProfile }),
}))

describe("web AccountControls", () => {
  beforeEach(() => jest.clearAllMocks())

  it("opens Clerk profile management and lets the user reopen it", async () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <AccountProfile onBack={jest.fn()} />
      </ThemeProvider>,
    )

    await waitFor(() => expect(mockOpenUserProfile).toHaveBeenCalledTimes(1))
    fireEvent.press(view.getByRole("button", { name: "Manage profile" }))
    expect(mockOpenUserProfile).toHaveBeenCalledTimes(2)
  })
})
