import { Linking } from "react-native"
import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { AccountDeletionReceiptScreen, DeleteAccountScreen } from "./DeleteAccountScreen"

describe("DeleteAccountScreen", () => {
  it("keeps deletion controls hidden while the request status is unresolved", () => {
    const view = render(
      <ThemeProvider initialContext="dark">
        <DeleteAccountScreen
          deletionStatus={undefined}
          subscription={{ store: "unknown" }}
          isSubmitting={false}
          onBack={jest.fn()}
          onRequestDeletion={jest.fn()}
        />
      </ThemeProvider>,
    )
    expect(view.getByText("Checking deletion status…")).toBeTruthy()
    expect(view.queryByTestId("delete-confirmation-input")).toBeNull()
    expect(view.queryByTestId("confirm-account-deletion-button")).toBeNull()
  })

  it("requires the explicit DELETE confirmation", () => {
    const onRequestDeletion = jest.fn()
    const view = render(
      <ThemeProvider initialContext="dark">
        <DeleteAccountScreen
          email="alice@example.com"
          deletionStatus={null}
          subscription={{ store: "unknown" }}
          isSubmitting={false}
          onBack={jest.fn()}
          onRequestDeletion={onRequestDeletion}
        />
      </ThemeProvider>,
    )
    const button = view.getByTestId("confirm-account-deletion-button")
    expect(button.props.accessibilityState.disabled).toBe(true)
    fireEvent.changeText(view.getByTestId("delete-confirmation-input"), "DELETE")
    expect(
      view.getByTestId("confirm-account-deletion-button").props.accessibilityState.disabled,
    ).toBe(false)
    fireEvent.press(view.getByTestId("confirm-account-deletion-button"))
    expect(onRequestDeletion).toHaveBeenCalledTimes(1)
  })

  const apple = { "Manage Apple subscriptions": "https://apps.apple.com/account/subscriptions" }
  const google = {
    "Manage Google Play subscriptions": "https://play.google.com/store/account/subscriptions",
  }
  const portal = "https://billing.revenuecat.com/manage/abc"
  it.each([
    ["App Store", { store: "app_store" }, apple, false],
    ["Google Play", { store: "play_store" }, google, false],
    ["web", { store: "web", url: portal }, { "Manage web subscription": portal }, true],
    ["web without a portal URL", { store: "web" }, {}, true],
    ["unknown", { store: "unknown" }, { ...apple, ...google }, true],
  ] as const)(
    "warns that billing continues and shows only the %s way to cancel",
    (_, subscription, links: Record<string, string>, showsWebCopy) => {
      const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined)
      const view = render(
        <ThemeProvider initialContext="dark">
          <DeleteAccountScreen
            deletionStatus={null}
            subscription={subscription}
            isSubmitting={false}
            onBack={jest.fn()}
            onRequestDeletion={jest.fn()}
          />
        </ThemeProvider>,
      )
      expect(view.getByText(/Deleting your account won't cancel it/)).toBeTruthy()
      expect(view.queryByText(/Subscribed on the web\?/) !== null).toBe(showsWebCopy)
      const labels = [
        "Manage Apple subscriptions",
        "Manage Google Play subscriptions",
        "Manage web subscription",
      ]
      for (const label of labels) {
        const url = links[label]
        if (!url) {
          expect(view.queryByText(label)).toBeNull()
          continue
        }
        fireEvent.press(view.getByText(label))
        expect(openURL).toHaveBeenLastCalledWith(url)
      }
      openURL.mockRestore()
    },
  )

  it("offers a retry after a failed deletion", () => {
    const view = render(
      <ThemeProvider initialContext="dark">
        <DeleteAccountScreen
          deletionStatus="failed"
          subscription={{ store: "unknown" }}
          isSubmitting={false}
          onBack={jest.fn()}
          onRequestDeletion={jest.fn()}
        />
      </ThemeProvider>,
    )
    expect(view.getByText("Deletion needs attention")).toBeTruthy()
    expect(view.getByText("Retry account deletion")).toBeTruthy()
    expect(view.getByTestId("delete-confirmation-input")).toBeTruthy()
  })

  it.each([
    ["processing", "Scryve is anonymizing connected history"],
    ["identity_pending", "Scryve is now removing your sign-in identity"],
  ] as const)("shows %s progress without deletion controls", (deletionStatus, description) => {
    const view = render(
      <ThemeProvider initialContext="dark">
        <DeleteAccountScreen
          deletionStatus={deletionStatus}
          subscription={{ store: "unknown" }}
          isSubmitting={false}
          onBack={jest.fn()}
          onRequestDeletion={jest.fn()}
        />
      </ThemeProvider>,
    )
    expect(view.getByText(new RegExp(description))).toBeTruthy()
    expect(view.queryByTestId("delete-confirmation-input")).toBeNull()
    expect(view.queryByTestId("confirm-account-deletion-button")).toBeNull()
  })

  it("shows a durable completion receipt with its last update and next action", () => {
    const updatedAt = Date.UTC(2026, 7, 23, 18, 45)
    const view = render(
      <ThemeProvider initialContext="dark">
        <AccountDeletionReceiptScreen
          status="completed"
          updatedAt={updatedAt}
          onBack={jest.fn()}
          onReturnHome={jest.fn()}
        />
      </ThemeProvider>,
    )

    expect(view.getByText("Your account was deleted")).toBeTruthy()
    expect(view.getByText("Deletion complete")).toBeTruthy()
    expect(view.getByText("No further action is needed.")).toBeTruthy()
    const day = new Date(updatedAt).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
    const time = new Date(updatedAt).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    })
    expect(view.getByTestId("account-deletion-last-update")).toHaveTextContent(
      `Last updated ${day} at ${time}`,
    )
  })

  it("gives a signed-out failed receipt one safe recovery action", () => {
    const onSignIn = jest.fn()
    const view = render(
      <ThemeProvider initialContext="dark">
        <AccountDeletionReceiptScreen
          status="failed"
          updatedAt={Date.now()}
          onBack={jest.fn()}
          onSignIn={onSignIn}
          onReturnHome={jest.fn()}
        />
      </ThemeProvider>,
    )

    expect(
      view.getByText("Scryve could not finish the remaining deletion work automatically."),
    ).toBeTruthy()
    expect(view.queryByText(/Clerk/)).toBeNull()
    fireEvent.press(view.getByText("Sign in to retry"))
    expect(onSignIn).toHaveBeenCalledTimes(1)
  })
})
