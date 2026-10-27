import { act, render } from "@testing-library/react-native"

import { DEFAULT_LOCAL_SETTINGS, localGameRepository } from "@/features/game/localPersistence"
import { ThemeProvider } from "@/theme/context"

import { SyncLatency } from "./syncLatency"
import { SyncStatsOverlay } from "./SyncStatsOverlay"

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}))

afterEach(() => localGameRepository.saveSettings(DEFAULT_LOCAL_SETTINGS))

it("shows this device's and each guest's sync times only once Stats for nerds is on", () => {
  const latency = new SyncLatency({ transport: "nearby", role: "host" })
  latency.setAuthority()
  const peers = () => [
    {
      name: "Pixel",
      summary: {
        ping: 38,
        delivery: { count: 12, p50: 98, p90: 160, p99: 410, over500: 0, over1000: 0 },
      },
    },
  ]
  const view = render(
    <ThemeProvider initialContext="dark">
      <SyncStatsOverlay latency={latency} peers={peers} />
    </ThemeProvider>,
  )
  expect(view.queryByTestId("sync-stats")).toBeNull()

  act(() => localGameRepository.saveSettings({ ...DEFAULT_LOCAL_SETTINGS, syncStats: true }))

  expect(view.getByText("You")).toBeTruthy()
  for (const value of ["Pixel", "38", "98", "160", "410", "12"])
    expect(view.getByText(value)).toBeTruthy()
})
