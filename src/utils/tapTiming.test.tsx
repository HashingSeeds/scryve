import { Platform } from "react-native"
import * as Sentry from "@sentry/react-native"
import { fireEvent, render } from "@testing-library/react-native"

import { LifeCard } from "@/components/LifeCard"
import { ThemeProvider } from "@/theme/context"

import { startTapTiming } from "./tapTiming"

jest.mock("@sentry/react-native", () => ({ metrics: { distribution: jest.fn() } }))

const mockAnalytics = { enabled: true }

jest.mock("@/utils/analytics", () => ({ analyticsEnabled: () => mockAnalytics.enabled }))

function pressPlus() {
  const view = render(
    <ThemeProvider>
      <LifeCard playerName="Ada" seatNumber={1} life={20} color="#41476E" onChange={jest.fn()} />
    </ThemeProvider>,
  )
  const plus = view.getByTestId("life-seat-1-1")
  fireEvent(plus, "pressIn")
  fireEvent.press(plus)
  fireEvent(plus, "pressOut")
}

describe("startTapTiming", () => {
  beforeEach(() => {
    mockAnalytics.enabled = true
    jest.replaceProperty(Platform, "OS", "ios")
    jest.spyOn(Math, "random").mockReturnValue(0)
    jest.spyOn(globalThis, "requestAnimationFrame").mockImplementation((frame) => {
      frame(0)
      return 0
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
    jest.clearAllMocks()
  })

  it("reports a sampled tap once, on the frame after its preview commits", () => {
    pressPlus()

    expect(Sentry.metrics.distribution).toHaveBeenCalledTimes(1)
    expect(Sentry.metrics.distribution).toHaveBeenCalledWith(
      "life.tap_to_paint",
      expect.any(Number),
      { unit: "millisecond", attributes: { os: "ios" } },
    )
  })

  it.each([
    ["usage sharing is off", () => (mockAnalytics.enabled = false)],
    ["the tap isn't sampled", () => jest.spyOn(Math, "random").mockReturnValue(0.2)],
    ["it runs on web", () => jest.replaceProperty(Platform, "OS", "web")],
  ])("reports nothing when %s", (_, arrange) => {
    arrange()

    expect(startTapTiming()).toBeUndefined()
  })
})
