import * as Updates from "expo-updates"
import { act, fireEvent, render } from "@testing-library/react-native"

import { createLocalGame } from "@/features/game/domain"
import { localGameRepository } from "@/features/game/localPersistence"
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

function startGameOnBoard() {
  const game = createLocalGame({
    startingLife: 20,
    players: [
      { name: "Ada", color: "#000" },
      { name: "Grace", color: "#111" },
    ],
  })
  const started = {
    ...game,
    players: game.players.map((player, index) => ({ ...player, life: index ? 20 : 18 })),
  }
  localGameRepository.saveActiveGame(started)
  return started
}

const renderToast = () => (
  <ThemeProvider initialContext="dark">
    <UpdateReadyToastWithForegroundChecks />
  </ThemeProvider>
)

describe("UpdateReadyToastWithForegroundChecks", () => {
  beforeEach(() => storage.clearAll())
  afterEach(() => jest.useRealTimers())

  it("waits until the player leaves a game in progress, then announces the update once", () => {
    startGameOnBoard()
    mockPathname = "/"
    const view = render(renderToast())
    expect(view.queryByTestId("update-ready-toast")).toBeNull()

    mockPathname = "/connected/decks"
    view.rerender(renderToast())
    expect(view.getByTestId("update-ready-toast")).toBeTruthy()
    view.unmount()

    expect(render(renderToast()).queryByTestId("update-ready-toast")).toBeNull()
  })

  it("announces the update on a board between games", () => {
    mockPathname = "/"
    expect(render(renderToast()).getByTestId("update-ready-toast")).toBeTruthy()
  })

  it("announces the update when a game on the board ends", () => {
    const game = startGameOnBoard()
    mockPathname = "/"
    const view = render(renderToast())
    expect(view.queryByTestId("update-ready-toast")).toBeNull()

    act(() => {
      localGameRepository.archiveGame({ ...game, status: "finished", finishedAt: Date.now() })
    })
    expect(view.getByTestId("update-ready-toast")).toBeTruthy()
  })

  it("keeps the notice for later when the player returns to a game before it closes", () => {
    jest.useFakeTimers()
    startGameOnBoard()
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
