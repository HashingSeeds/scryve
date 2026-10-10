import { BackHandler } from "react-native"

type BackListener = Parameters<typeof BackHandler.addEventListener>[1]

/** why: the jest preset renders as iOS, where BackHandler never fires, so this stands in for Android's dispatch: newest listener first, stopping at the first that returns true. Returns whether anything consumed Back. */
export function mockHardwareBack() {
  const listeners: BackListener[] = []
  jest.spyOn(BackHandler, "addEventListener").mockImplementation((_, listener) => {
    listeners.push(listener)
    return { remove: () => void listeners.splice(listeners.indexOf(listener), 1) }
  })
  const event = { type: "hardwareBackPress", timeStamp: 0 }
  return () => [...listeners].reverse().some((listener) => listener(event))
}
