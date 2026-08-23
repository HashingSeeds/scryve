import { router } from "expo-router"
import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { ErrorBoundary } from "../src/app/delete-account"

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), replace: jest.fn() },
}))
jest.mock("@clerk/expo", () => ({ useUser: jest.fn() }))
jest.mock("convex/react", () => ({
  useConvexAuth: jest.fn(),
  useMutation: jest.fn(),
  useQuery: jest.fn(),
}))

describe("delete account route", () => {
  it("contains query failures and offers a scoped retry", () => {
    const retry = jest.fn().mockResolvedValue(undefined)
    const view = render(
      <ThemeProvider initialContext="dark">
        <ErrorBoundary error={new Error("Query failed")} retry={retry} />
      </ThemeProvider>,
    )

    expect(view.getByRole("alert")).toHaveTextContent(
      /Account deletion stays unavailable until the check succeeds\./,
    )
    expect(view.queryByTestId("confirm-account-deletion-button")).toBeNull()
    fireEvent.press(view.getByText("Try again"))
    expect(retry).toHaveBeenCalledTimes(1)
    fireEvent.press(view.getByText("Return home"))
    expect(router.replace).toHaveBeenCalledWith("/")
  })
})
