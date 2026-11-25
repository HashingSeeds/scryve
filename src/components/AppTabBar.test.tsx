import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { AppTabBar } from "./AppTabBar"

jest.mock("@/features/lan/lanAvailability", () => ({ nearbyBetaAvailable: () => false }))

it("marks the open tab and runs a More item once its sheet closes", () => {
  const onSelect = jest.fn()
  const onHistory = jest.fn()
  const view = render(
    <ThemeProvider initialContext="dark">
      <AppTabBar
        tab="cards"
        onSelect={onSelect}
        utility={{
          onHistory,
          onSettings: jest.fn(),
          onSupport: jest.fn(),
          onAccount: jest.fn(),
        }}
      />
    </ThemeProvider>,
  )

  expect(view.getByTestId("app-tab-cards").props.accessibilityState).toEqual({ selected: true })
  fireEvent.press(view.getByTestId("app-tab-decks"))
  expect(onSelect).toHaveBeenCalledWith("decks")

  fireEvent.press(view.getByTestId("app-tab-more"))
  fireEvent.press(view.getByTestId("utility-history-button"))
  expect(onHistory).toHaveBeenCalledTimes(1)
  expect(view.queryByTestId("utility-history-button")).toBeNull()
})
