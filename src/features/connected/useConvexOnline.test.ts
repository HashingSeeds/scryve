import { Platform } from "react-native"
import { useNetworkState } from "expo-network"
import { renderHook } from "@testing-library/react-native"

import { useConvexOnline } from "./useConvexOnline"

jest.mock("convex/react", () => ({
  useConvexConnectionState: () => ({ isWebSocketConnected: true }),
}))

describe("useConvexOnline", () => {
  it("goes offline on native when the device loses its network, before the socket notices", () => {
    jest.mocked(useNetworkState).mockReturnValue({})
    const { result, rerender } = renderHook(useConvexOnline)
    expect(result.current).toBe(true)

    jest.mocked(useNetworkState).mockReturnValue({ isConnected: false })
    rerender({})
    expect(result.current).toBe(false)
  })

  it("keeps web on the browser signal", () => {
    jest.replaceProperty(Platform, "OS", "web")
    jest.mocked(useNetworkState).mockReturnValue({ isConnected: false })
    expect(renderHook(useConvexOnline).result.current).toBe(true)
  })
})
