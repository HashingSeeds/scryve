import { BackHandler } from "react-native"

type BackListener = Parameters<typeof BackHandler.addEventListener>[1]

export function mockHardwareBack() {
  const listeners: BackListener[] = []
  jest.spyOn(BackHandler, "addEventListener").mockImplementation((_, listener) => {
    listeners.push(listener)
    return { remove: () => void listeners.splice(listeners.indexOf(listener), 1) }
  })
  const event = { type: "hardwareBackPress", timeStamp: 0 }
  return () => [...listeners].reverse().some((listener) => listener(event))
}
