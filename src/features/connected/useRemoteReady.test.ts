import { renderHook } from "@testing-library/react-native"

import { toConnectedProjection } from "./model"
import { useRemoteReady } from "./useRemoteReady"

jest.mock("./model", () => ({ toConnectedProjection: jest.fn() }))
const projection = { publicId: "game-1" }
jest
  .mocked(toConnectedProjection)
  .mockImplementation((remote) => (remote === projection ? (projection as never) : null))

type Props = { publicId: string; isAuthenticated: boolean; remote: unknown }
const renderReady = (initialProps: Props) =>
  renderHook(
    ({ publicId, isAuthenticated, remote }: Props) =>
      useRemoteReady(publicId, isAuthenticated, remote),
    { initialProps },
  )

describe("useRemoteReady", () => {
  it("stays ready while the projection query reloads for new args", () => {
    const { result, rerender } = renderReady({
      publicId: "game-1",
      isAuthenticated: true,
      remote: undefined,
    })
    expect(result.current).toBe(false)
    rerender({ publicId: "game-1", isAuthenticated: true, remote: projection })
    expect(result.current).toBe(true)
    rerender({ publicId: "game-1", isAuthenticated: true, remote: undefined })
    expect(result.current).toBe(true)
  })

  it("drops readiness when the server answers null, the user signs out, or the game changes", () => {
    const { result, rerender } = renderReady({
      publicId: "game-1",
      isAuthenticated: true,
      remote: projection,
    })
    rerender({ publicId: "game-1", isAuthenticated: true, remote: null })
    expect(result.current).toBe(false)
    rerender({ publicId: "game-1", isAuthenticated: true, remote: projection })
    rerender({ publicId: "game-1", isAuthenticated: false, remote: undefined })
    expect(result.current).toBe(false)
    rerender({ publicId: "game-1", isAuthenticated: true, remote: projection })
    rerender({ publicId: "game-2", isAuthenticated: true, remote: undefined })
    expect(result.current).toBe(false)
    rerender({ publicId: "game-1", isAuthenticated: true, remote: undefined })
    expect(result.current).toBe(false)
  })
})
