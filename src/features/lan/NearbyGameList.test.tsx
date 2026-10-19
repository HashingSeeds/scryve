import { act, render, screen } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { NearbyGameList } from "./NearbyGameList"

jest.mock("./lanSession", () => ({ lanSession: {}, useLanSession: () => ({}) }))
jest.mock("./useNearbyGames", () => ({
  useNearbyGames: () => ({ denied: false, games: [] }),
}))

describe("NearbyGameList", () => {
  it("points at the Wi-Fi once a search keeps finding nothing", () => {
    jest.useFakeTimers()
    render(
      <ThemeProvider initialContext="dark">
        <NearbyGameList onJoin={jest.fn()} />
      </ThemeProvider>,
    )

    expect(screen.getByText("No games on this network yet.")).toBeTruthy()
    act(() => jest.advanceTimersByTime(10_000))
    expect(screen.getByText(/same Wi-Fi as the host/)).toBeTruthy()
    jest.useRealTimers()
  })
})
