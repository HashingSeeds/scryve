import { fireEvent, render, waitFor } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { AccountProfile } from "./AccountControls.web"

const mockOpenUserProfile = jest.fn()
const mockCloseUserProfile = jest.fn()
const mockSignOut = jest.fn()
const mockUser = jest.fn()

jest.mock("@clerk/expo", () => ({
  useClerk: () => ({
    openUserProfile: mockOpenUserProfile,
    closeUserProfile: mockCloseUserProfile,
    signOut: mockSignOut,
  }),
  useUser: () => ({ user: mockUser() }),
}))

describe("web AccountControls", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSignOut.mockResolvedValue(undefined)
    mockUser.mockReturnValue({
      fullName: "Ada Lovelace",
      username: "ada",
      hasImage: false,
      imageUrl: "https://img.clerk.com/ada",
      primaryEmailAddress: { emailAddress: "ada@example.com" },
    })
  })

  const renderProfile = (
    props: Partial<{ onBack: () => void; onSigningOut: (signingOut: boolean) => void }> = {},
  ) =>
    render(
      <ThemeProvider initialContext="light">
        <AccountProfile
          onBack={jest.fn()}
          onOpenTerms={jest.fn()}
          onOpenPrivacy={jest.fn()}
          onOpenGameContentNotices={jest.fn()}
          {...props}
        />
      </ThemeProvider>,
    )

  it("shows who is signed in without opening Clerk on arrival", () => {
    const view = renderProfile()

    expect(view.getByText("Ada Lovelace")).toBeTruthy()
    expect(view.getByText("ada@example.com")).toBeTruthy()
    expect(mockOpenUserProfile).not.toHaveBeenCalled()
  })

  it("opens Clerk profile management on request", () => {
    const view = renderProfile()

    fireEvent.press(view.getByTestId("manage-profile-item"))

    expect(mockOpenUserProfile).toHaveBeenCalledTimes(1)
  })

  it("signs out and tells the caller it is in flight", async () => {
    const onSigningOut = jest.fn()
    const view = renderProfile({ onSigningOut })

    fireEvent.press(view.getByTestId("sign-out-button"))

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(onSigningOut.mock.calls).toEqual([[true], [false]]))
    expect(mockCloseUserProfile).toHaveBeenCalledTimes(1)
  })

  it("reports a failed sign out and stays on the screen", async () => {
    mockSignOut.mockRejectedValue(new Error("Network down"))
    const onSigningOut = jest.fn()
    const view = renderProfile({ onSigningOut })

    fireEvent.press(view.getByTestId("sign-out-button"))

    await waitFor(() => expect(view.getByText("Network down")).toBeTruthy())
    expect(onSigningOut.mock.calls).toEqual([[true], [false]])
  })
})
