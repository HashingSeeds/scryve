import type { ConnectedProjection } from "@/features/connected/model"

export function projection(eventSequence: number, currentLife: number): ConnectedProjection {
  return {
    schemaVersion: 1,
    publicId: "game-public",
    status: "active",
    playerCount: 2,
    startingLife: 20,
    ruleset: "standard",
    isHost: true,
    eventSequence,
    serverUpdatedAt: eventSequence + 1,
    recentOperationIds: [],
    players: [
      {
        playerId: "player-1",
        seat: 1,
        displayName: "Ada",
        color: "#111111",
        currentLife,
        controlledByMe: true,
      },
      {
        playerId: "player-2",
        seat: 2,
        displayName: "Grace",
        color: "#222222",
        currentLife: 20,
        controlledByMe: false,
      },
    ],
  }
}
