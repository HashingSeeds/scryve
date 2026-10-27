import { act, render, screen, waitFor } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { NearbyGameList } from "./NearbyGameList"

const mockAccess = jest.fn()
const mockJoin = jest.fn()
let mockServices: { name: string }[] = []
jest.mock("./lanSession", () => ({
  lanSession: { join: (service: unknown) => mockJoin(service), isReachable: () => true },
  useLanSessionSlice: (select: (state: object) => unknown) => select({}),
}))
jest.mock("./lanTransport", () => ({
  checkLocalNetworkAccess: () => mockAccess(),
  isLanGameService: () => true,
  LAN_SERVICE_TYPE: "scryve",
}))
jest.mock("react-native-zeroconf", () => ({ useZeroconf: () => ({ services: mockServices }) }))

const renderList = (props: { code?: string; onJoin?: () => void } = {}) =>
  render(
    <ThemeProvider initialContext="dark">
      <NearbyGameList onJoin={jest.fn()} {...props} />
    </ThemeProvider>,
  )

describe("NearbyGameList", () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.useRealTimers()
    mockServices = []
    mockJoin.mockReset()
  })

  it("joins the nearby game advertising the entered code", async () => {
    mockAccess.mockResolvedValue("granted")
    const host = { name: "Sam AB23CD" }
    mockServices = [{ name: "Ana XY45ZW" }, host]
    const onJoin = jest.fn()
    renderList({ code: "ab2-3cd", onJoin })

    await act(async () => {})
    expect(mockJoin).toHaveBeenCalledWith(host)
    expect(onJoin).toHaveBeenCalledTimes(1)
  })

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
