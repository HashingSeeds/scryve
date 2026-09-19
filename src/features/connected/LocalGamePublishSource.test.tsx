import { act, render } from "@testing-library/react-native"

import { createLocalGame } from "@/features/game/domain"
import type { LocalConnectFeed } from "@/screens/NewGameScreen"

import { LocalGamePublishSource } from "./LocalGamePublishSource"

const mockPublish = jest.fn()
jest.mock("convex/react", () => ({ useMutation: () => mockPublish }))
const mockCreateLobbyIdentifiers = jest.fn()
jest.mock("./identifiers", () => ({
  createLobbyIdentifiers: (...args: unknown[]) => mockCreateLobbyIdentifiers(...args),
}))
jest.mock("@/features/game/localPersistence", () => ({
  LocalGameRepository: jest.fn(() => ({ getDeviceId: () => "device-1" })),
}))
jest.mock("../../../convex/_generated/api", () => ({
  api: { games: { publishLocalGame: "games.publishLocalGame" } },
}))

const identifiers = {
  inviteToken: "t".repeat(43),
  publicId: "published-game-id-00001",
  manualCodeCandidates: ["ABC234"],
}

function publishableGame() {
  return createLocalGame({
    players: [
      { name: "Ada", color: "#FF0000" },
      { name: "Grace", color: "#00FF00" },
    ],
    startingLife: 20,
  })
}

function renderSource(onPublished: jest.Mock) {
  const game = publishableGame()
  let feed!: LocalConnectFeed
  render(
    <LocalGamePublishSource game={game} onPublished={onPublished}>
      {(next) => {
        feed = next
        return null
      }}
    </LocalGamePublishSource>,
  )
  return {
    publish: () => feed.publish(game.players[0].id),
    get feed() {
      return feed
    },
  }
}

describe("LocalGamePublishSource", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCreateLobbyIdentifiers.mockResolvedValue(identifiers)
    mockPublish.mockResolvedValue({ publicId: identifiers.publicId, manualCode: "ABC234" })
  })

  it("retries with fresh identifiers after a failed generation", async () => {
    mockCreateLobbyIdentifiers
      .mockRejectedValueOnce(new Error("no entropy"))
      .mockResolvedValue(identifiers)
    const onPublished = jest.fn()
    const source = renderSource(onPublished)

    await act(async () => {
      source.publish()
    })
    expect(source.feed.error).toBe("no entropy")
    expect(onPublished).not.toHaveBeenCalled()

    await act(async () => {
      source.publish()
    })
    expect(mockCreateLobbyIdentifiers).toHaveBeenCalledTimes(2)
    expect(onPublished).toHaveBeenCalledWith({
      publicId: identifiers.publicId,
      manualCode: "ABC234",
    })
  })

  it("reuses identifiers when the mutation itself fails", async () => {
    mockPublish.mockRejectedValueOnce(new Error("boom"))
    const onPublished = jest.fn()
    const source = renderSource(onPublished)

    await act(async () => {
      source.publish()
    })
    expect(source.feed.error).toBe("boom")

    await act(async () => {
      source.publish()
    })
    expect(mockCreateLobbyIdentifiers).toHaveBeenCalledTimes(1)
    expect(mockPublish).toHaveBeenCalledTimes(2)
    expect(onPublished).toHaveBeenCalledTimes(1)
  })
})
