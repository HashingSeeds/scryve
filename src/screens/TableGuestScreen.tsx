import { useMemo, useState } from "react"
import type { ViewStyle } from "react-native"
import { View } from "react-native"
import { useKeepAwake } from "expo-keep-awake"

import { PlayerGrid } from "@/components/PlayerGrid"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { GameBoardStage } from "@/features/game/GameBoardStage"
import { useMenuButtonStyle } from "@/features/game/useMenuButtonStyle"
import { useSeatColors } from "@/features/game/useSeatColors"
import { useTableGuest } from "@/features/table/useTableLink"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

/** why: the guest draws only what the host sends back, so the host's game is the single source of truth. */
export function TableGuestScreen({
  sessionId,
  onLeave,
}: {
  sessionId: string
  onLeave: () => void
}) {
  useKeepAwake("count-table-guest", { suppressDeactivateWarnings: true })
  const { status, game, send } = useTableGuest(sessionId)
  const menuButtonStyle = useMenuButtonStyle()
  const { themed } = useAppTheme()
  const [menuOpen, setMenuOpen] = useState(false)
  const seatColors = useSeatColors(game?.players ?? [])
  const actions = useMemo(
    () => [{ kind: "home" as const, label: "Leave", onPress: onLeave }],
    [onLeave],
  )

  if (!game)
    return (
      <Screen preset="fixed" safeAreaEdges={["top", "bottom"]}>
        <View style={themed($waiting)}>
          <Text testID="table-guest-status" text={`Table ${status.state}`} />
          {status.detail ? <Text size="xs" text={status.detail} /> : null}
        </View>
      </Screen>
    )

  return (
    <Screen preset="fixed" safeAreaEdges={[]} SystemBarsProps={{ hidden: true }}>
      <GameBoardStage
        playerCount={game.players.length}
        layoutVariant={game.layout ?? "auto"}
        renderGrid={(boardOrientation) => (
          <PlayerGrid
            boardOrientation={boardOrientation}
            players={game.players}
            system={game.system}
            lifeStep={game.lifeStep}
            layoutVariant={game.layout ?? "auto"}
            disabled={menuOpen || status.state !== "connected"}
            onChange={(playerId, delta) => send({ type: "life.change", playerId, delta })}
          />
        )}
        menu={{
          open: menuOpen,
          actions,
          variant: menuButtonStyle,
          seatColors,
          statusLine: {
            text: status.state === "connected" ? "Table connected" : `Table ${status.state}`,
            tone: status.state === "connected" ? "caughtUp" : "offline",
            onPress: () => setMenuOpen(false),
          },
          onToggle: () => setMenuOpen((open) => !open),
          onClose: () => setMenuOpen(false),
        }}
      />
    </Screen>
  )
}

const $waiting: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
  gap: spacing.xs,
})
