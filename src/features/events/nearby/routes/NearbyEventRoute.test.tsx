import { render } from "@testing-library/react-native"

import { nearbyEventClient } from "@/features/events/nearby/nearbyEventClient"

import NearbyEventRoute from "./NearbyEventRoute"

jest.mock("expo-router", () => ({ Redirect: () => null, router: {} }))
jest.mock("@/features/events/EventScreen", () => ({ EventScreen: () => null }))
jest.mock("@/features/events/nearby/useNearbyEventSource", () => ({
  useClientEventSource: () => ({}),
}))
jest.mock("@/features/events/nearby/nearbyEventClient", () => ({
  nearbyEventClient: { leave: jest.fn() },
  useNearbyEventClient: () => ({ status: "connected" }),
}))

it("leaves the event when the screen goes away without the back button", () => {
  const { unmount } = render(<NearbyEventRoute />)
  expect(nearbyEventClient.leave).not.toHaveBeenCalled()
  unmount()
  expect(nearbyEventClient.leave).toHaveBeenCalledTimes(1)
})
