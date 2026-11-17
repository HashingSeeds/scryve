import { I18nManager } from "react-native"

import { applyAppDirection } from "./applyAppDirection"

function launch({ nativeRTL }: { nativeRTL: boolean }) {
  Object.defineProperty(I18nManager, "isRTL", { value: nativeRTL, configurable: true })
  const reload = jest.fn()
  applyAppDirection(reload)
  return reload
}

describe("applyAppDirection", () => {
  const allowRTL = jest.spyOn(I18nManager, "allowRTL")
  const forceRTL = jest.spyOn(I18nManager, "forceRTL")

  it("saves the English app's direction over a right-to-left launch and reloads once", () => {
    expect(launch({ nativeRTL: true })).toHaveBeenCalledTimes(1)
    expect(allowRTL).toHaveBeenLastCalledWith(false)
    expect(forceRTL).toHaveBeenLastCalledWith(false)

    expect(launch({ nativeRTL: true })).not.toHaveBeenCalled()
  })

  it("reloads again once a launch has matched", () => {
    launch({ nativeRTL: false })

    expect(launch({ nativeRTL: true })).toHaveBeenCalledTimes(1)
  })
})
