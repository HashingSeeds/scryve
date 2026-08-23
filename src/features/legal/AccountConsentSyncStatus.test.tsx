import { StyleSheet } from "react-native"
import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { AccountConsentSyncStatus } from "./AccountConsentSyncStatus"

jest.mock("react-native-safe-area-context", () => ({
  ...jest.requireActual("react-native-safe-area-context"),
  useSafeAreaInsets: () => ({ top: 31, right: 0, bottom: 0, left: 0 }),
}))

describe("AccountConsentSyncStatus", () => {
  it("overlays app content below the top safe area instead of taking layout space", () => {
    const onRetry = jest.fn()
    const view = render(
      <ThemeProvider initialContext="light">
        <AccountConsentSyncStatus isSyncing={false} retryFailed onRetry={onRetry} />
      </ThemeProvider>,
    )

    expect(
      StyleSheet.flatten(view.getByTestId("account-consent-sync-layer").props.style),
    ).toMatchObject({
      position: "absolute",
      top: 39,
      left: 8,
      right: 8,
    })
    expect(view.getByTestId("account-consent-sync-layer").props.pointerEvents).toBe("box-none")
    fireEvent.press(view.getByTestId("retry-account-consent-sync"))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
