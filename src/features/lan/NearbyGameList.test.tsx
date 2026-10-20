import { act, render, screen, waitFor } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { NearbyGameList } from "./NearbyGameList"

const mockAccess = jest.fn()
jest.mock("./lanSession", () => ({
  lanSession: {},
  useLanSessionSlice: (select: (state: object) => unknown) => select({}),
}))
jest.mock("./lanTransport", () => ({
  checkLocalNetworkAccess: () => mockAccess(),
  isLanGameService: () => true,
  LAN_SERVICE_TYPE: "scryve",
}))
jest.mock("react-native-zeroconf", () => ({ useZeroconf: () => ({ services: [] }) }))

const renderList = () =>
  render(
    <ThemeProvider initialContext="dark">
      <NearbyGameList onJoin={jest.fn()} />
    </ThemeProvider>,
  )

describe("NearbyGameList", () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it("points at the Wi-Fi once a scan keeps finding nothing", async () => {
    mockAccess.mockResolvedValue("granted")
    renderList()

    await act(async () => {})
    expect(screen.getByText("No games on this network yet.")).toBeTruthy()
    await act(() => jest.advanceTimersByTimeAsync(10_000))
    expect(screen.getByText(/same Wi-Fi as the host/)).toBeTruthy()
  })

  it("does not count time spent waiting for local network access", async () => {
    let grant: (value: string) => void = () => {}
    mockAccess.mockReturnValue(new Promise((resolve) => (grant = resolve)))
    renderList()

    await act(() => jest.advanceTimersByTimeAsync(10_000))
    await act(async () => grant("granted"))
    await waitFor(() => expect(screen.getByText("No games on this network yet.")).toBeTruthy())
    expect(screen.queryByText(/same Wi-Fi as the host/)).toBeNull()
  })
})
