import { Platform } from "react-native"

import { lanPlayAvailable, nearbyBetaAvailable } from "./lanAvailability"

let mockBeta = false
let mockAppVariant = "production"
jest.mock("@/features/updates/appUpdate", () => ({ betaUpdatesChosen: () => mockBeta }))
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: { appVariant: mockAppVariant } }
    },
  },
}))

const original = { dev: __DEV__, os: Platform.OS }
beforeEach(() => {
  mockBeta = false
  mockAppVariant = "production"
  Object.assign(globalThis, { __DEV__: false })
  Platform.OS = "ios"
})
afterAll(() => {
  Object.assign(globalThis, { __DEV__: original.dev })
  Platform.OS = original.os
})

it("offers nearby games in every store build while nearby events stay with beta testers", () => {
  expect(lanPlayAvailable()).toBe(true)
  expect(nearbyBetaAvailable()).toBe(false)

  Platform.OS = "web"
  expect(lanPlayAvailable()).toBe(false)
})

it.each([
  ["development builds", () => Object.assign(globalThis, { __DEV__: true })],
  ["preview builds", () => (mockAppVariant = "preview")],
  ["players on beta updates", () => (mockBeta = true)],
])("opens nearby events to %s", (_, setUp) => {
  setUp()
  expect(nearbyBetaAvailable()).toBe(true)

  Platform.OS = "web"
  expect(nearbyBetaAvailable()).toBe(false)
})
