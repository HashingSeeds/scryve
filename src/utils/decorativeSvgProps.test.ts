import { Platform } from "react-native"

import { decorativeSvgProps } from "./decorativeSvgProps"

afterEach(() => {
  jest.restoreAllMocks()
})

it("keeps the native props on native", () => {
  jest.replaceProperty(Platform, "OS", "ios")
  expect(decorativeSvgProps({ accessible: false })).toEqual({ accessible: false })
})

it("swaps them for aria-hidden on web", () => {
  jest.replaceProperty(Platform, "OS", "web")
  expect(decorativeSvgProps({ accessible: false })).toEqual({ "aria-hidden": true })
})
