import { fireEvent, render, waitFor } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { AccountProfile } from "./AccountControls"

const mockSignOut = jest.fn(async () => undefined)
const mockWriteSessionHint = jest.fn()
jest.mock("./sessionHint", () => ({
  writeSessionHint: (hint: unknown) => mockWriteSessionHint(hint),
}))

jest.mock("@clerk/expo", () => ({
  useClerk: () => ({ signOut: mockSignOut }),
  useUser: () => ({
    user: {
      id: "user_ada",
      fullName: "Ada Lovelace",
      username: "ada",
      imageUrl: "https://example.com/ada.png",
      primaryEmailAddress: { emailAddress: "ada@example.com" },
    },
  }),
}))

jest.mock("@clerk/expo/native", () => {
  const { View } = jest.requireActual("react-native")
  return {
    UserProfileView: (props: object) => <View testID="native-user-profile" {...props} />,
  }
})

describe("AccountControls", () => {
  beforeEach(() => jest.clearAllMocks())

  const legalProps = {
    onOpenTerms: jest.fn(),
    onOpenPrivacy: jest.fn(),
    onOpenGameContentNotices: jest.fn(),
  }

  it("renders the Scryve account screen before Clerk's profile manager", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <AccountProfile onBack={jest.fn()} {...legalProps} />
      </ThemeProvider>,
    )

    expect(view.getByText("Ada Lovelace")).toBeTruthy()
    expect(view.getByText("ada@example.com")).toBeTruthy()
    expect(view.queryByTestId("native-user-profile")).toBeNull()

    fireEvent.press(view.getByTestId("manage-profile-item"))

    expect(view.getByTestId("native-user-profile")).toHaveStyle({ flex: 1 })
    expect(view.getByTestId("native-user-profile").props.isDismissible).toBeUndefined()
  })

  it("clears the session hint before opening Clerk's profile sheet, which can sign out on its own", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <AccountProfile onBack={jest.fn()} {...legalProps} />
      </ThemeProvider>,
    )

    fireEvent.press(view.getByTestId("manage-profile-item"))
    expect(mockWriteSessionHint).toHaveBeenLastCalledWith({ userId: null })

    fireEvent(view.getByTestId("native-user-profile"), "dismiss")
    expect(mockWriteSessionHint).toHaveBeenCalledTimes(1)
  })

  it("owns sign out and reports it to the route", async () => {
    const onSignedOut = jest.fn()
    const view = render(
      <ThemeProvider initialContext="dark">
        <AccountProfile onSignedOut={onSignedOut} {...legalProps} />
      </ThemeProvider>,
    )

    fireEvent.press(view.getByTestId("sign-out-button"))

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1))
    expect(onSignedOut).toHaveBeenCalledTimes(1)
    expect(mockWriteSessionHint).toHaveBeenCalledWith({ userId: null })
    expect(mockWriteSessionHint.mock.invocationCallOrder[0]).toBeLessThan(
      mockSignOut.mock.invocationCallOrder[0],
    )
  })
})
