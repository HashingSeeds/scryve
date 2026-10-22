import { fireEvent, render, waitFor } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { FeedbackFormScreen } from "./FeedbackFormScreen"

function renderForm(signedIn: boolean, onSubmit = jest.fn(async () => undefined)) {
  const onSignIn = jest.fn()
  const view = render(
    <ThemeProvider initialContext="dark">
      <FeedbackFormScreen
        signedIn={signedIn}
        onSignIn={onSignIn}
        onSubmit={onSubmit}
        onBack={jest.fn()}
      />
    </ThemeProvider>,
  )
  fireEvent.changeText(view.getByPlaceholderText("One line"), " Dark board ")
  fireEvent.changeText(
    view.getByPlaceholderText("What would you like, and when would you use it?"),
    "Please",
  )
  return { view, onSubmit, onSignIn }
}

describe("FeedbackFormScreen", () => {
  it("sends without the account unless a signed-in player turns it on", async () => {
    const { view, onSubmit } = renderForm(true)
    fireEvent.press(view.getByText("Send"))
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        kind: "feature",
        title: "Dark board",
        body: "Please",
        includeAccount: false,
      }),
    )

    const second = renderForm(true)
    fireEvent(second.view.getByTestId("feedback-include-account"), "valueChange", true)
    fireEvent.press(second.view.getByText("Send"))
    await waitFor(() =>
      expect(second.onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ includeAccount: true }),
      ),
    )
  })

  it("tells a signed-out player replies stay on this device and offers sign-in", () => {
    const { view, onSignIn } = renderForm(false)
    expect(view.queryByTestId("feedback-include-account")).toBeNull()
    fireEvent.press(view.getByText("Sign in to keep it"))
    expect(onSignIn).toHaveBeenCalled()
  })

  it("keeps the draft when sending fails", async () => {
    const { view } = renderForm(
      false,
      jest.fn(async () => Promise.reject(new Error("offline"))),
    )
    fireEvent.press(view.getByText("Send"))
    expect(await view.findByText("Couldn't send. Try again.")).toBeTruthy()
    expect(view.getByDisplayValue(" Dark board ")).toBeTruthy()
  })
})
