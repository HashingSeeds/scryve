import { Platform } from "react-native"

import { lanPlayAvailable, nearbyBetaAvailable } from "./lanAvailability"

jest.mock("@/features/updates/appUpdate", () => ({ betaUpdatesChosen: () => false }))

const original = { dev: __DEV__, os: Platform.OS }
afterEach(() => {
  Object.assign(globalThis, { __DEV__: original.dev })
  Platform.OS = original.os
})

it("offers nearby games in every store build while nearby events stay with beta testers", () => {
  Object.assign(globalThis, { __DEV__: false })
  Platform.OS = "ios"

  expect(lanPlayAvailable()).toBe(true)
  expect(nearbyBetaAvailable()).toBe(false)

  Platform.OS = "web"
  expect(lanPlayAvailable()).toBe(false)
})
