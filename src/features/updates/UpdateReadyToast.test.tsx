import * as Updates from "expo-updates"
import { act, fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"
import { storage } from "@/utils/storage"

import { RESTART_FADE_MS } from "./appUpdate"
import { RestartCurtain } from "./RestartCurtain"
import { UpdateReadyToastWithForegroundChecks } from "./UpdateReadyToast"

let mockPathname = "/"
jest.mock("expo-router", () => ({ usePathname: () => mockPathname }))
let mockPlayVersion: number | null = null
const mockCompleteUpdate = jest.fn(() => Promise.resolve())
jest.mock("../../../modules/play-app-update", () => ({
  useDownloadedPlayVersion: () => mockPlayVersion,
  completeUpdate: () => mockCompleteUpdate(),
}))
jest.mock("expo-updates", () => ({
  __esModule: true,
  isEnabled: false,
  reloadAsync: jest.fn(() => Promise.resolve()),
  useUpdates: () => ({
    isDownloading: false,
    isUpdatePending: true,
    downloadedUpdate: { updateId: "next-update", manifest: {} },
  }),
}))

const renderToast = () => (
  <ThemeProvider initialContext="dark">
    <UpdateReadyToastWithForegroundChecks />
  </ThemeProvider>
)

describe("UpdateReadyToastWithForegroundChecks", () => {
  beforeEach(() => storage.clearAll())
  afterEach(() => jest.useRealTimers())

  it("waits until the player leaves the board, then announces the update once", () => {
    mockPathname = "/"
    const view = render(renderToast())
    expect(view.queryByTestId("update-ready-toast")).toBeNull()

    mockPathname = "/connected/decks"
    view.rerender(renderToast())
    expect(view.getByTestId("update-ready-toast")).toBeTruthy()
    view.unmount()

    expect(render(renderToast()).queryByTestId("update-ready-toast")).toBeNull()
  })

  it("keeps the notice for later when the player returns to the board before it closes", () => {
    jest.useFakeTimers()
    mockPathname = "/connected/decks"
    const view = render(renderToast())
    expect(view.getByTestId("update-ready-toast")).toBeTruthy()

    mockPathname = "/"
    view.rerender(renderToast())
    act(() => jest.advanceTimersByTime(20_000))

    mockPathname = "/history"
    view.rerender(renderToast())
    expect(view.getByTestId("update-ready-toast")).toBeTruthy()
    act(() => jest.advanceTimersByTime(8_000))
    expect(view.queryByTestId("update-ready-toast")).toBeNull()
  })

  it("restarts into a Play download behind the same curtain as an OTA update", () => {
    jest.useFakeTimers()
    mockPlayVersion = 42
    mockPathname = "/history"
    const view = render(
      <>
        {renderToast()}
        <RestartCurtain />
      </>,
    )

    fireEvent.press(view.getByTestId("update-toast-restart-button"))
    expect(view.getByTestId("restart-curtain")).toBeTruthy()
    expect(mockCompleteUpdate).not.toHaveBeenCalled()

    act(() => jest.advanceTimersByTime(RESTART_FADE_MS))
    expect(mockCompleteUpdate).toHaveBeenCalledTimes(1)
    expect(Updates.reloadAsync).not.toHaveBeenCalled()
  })
})
