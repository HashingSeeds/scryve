import type { TextStyle, ViewStyle } from "react-native"
import { Pressable, View } from "react-native"

import { COMMANDER_LETHAL_DAMAGE } from "@/features/game/domain"
import type { GamePlayer, PlayerId } from "@/features/game/types"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { accessibleForeground } from "@/utils/colorContrast"

import { overlayTint } from "./LifeControls"
import type { LifeCardContentRotation } from "./playerCardTypes"
import { PlayerMark } from "./PlayerMark"
import { Text } from "./Text"
import type { PlayerMarkShape } from "../../convex/lib/appearance"

const CENTERED_NAME_HALF_WIDTH = 48
const PIP = { length: 38, depth: 26 }
const COMPACT_PIP = { length: 30, depth: 22 }

export interface CommanderStripProps {
  seatNumber: number
  identity: string
  ownerPlayerId: PlayerId
  players: readonly GamePlayer[]
  incoming: Record<PlayerId, number>
  shape?: PlayerMarkShape
  color: string
  foreground: string
  contentRotation: LifeCardContentRotation
  compact?: boolean
  open: boolean
  disabled?: boolean
  inspectDisabled?: boolean
  onToggle: () => void
  onPressSword: () => void
  edgeLength?: number
}

export function CommanderStrip({
  seatNumber,
  identity,
  ownerPlayerId,
  players,
  incoming,
  shape,
  color,
  foreground,
  contentRotation,
  compact,
  open,
  disabled,
  inspectDisabled,
  onToggle,
  onPressSword,
  edgeLength,
}: CommanderStripProps) {
  const {
    themed,
    theme: { spacing },
  } = useAppTheme()
  const opponents = players
    .map((player, index) => ({ player, seat: index + 1, total: incoming[player.id] ?? 0 }))
    .filter(({ player }) => player.id !== ownerPlayerId)
  const dealt = opponents.filter(({ total }) => total > 0)
  const summary = dealt.length
    ? dealt.map(({ player, total }) => `${total} from ${player.name}`).join(", ")
    : "no commander damage"
  const sideways = Math.abs(contentRotation) === 90
  const pip = compact ? COMPACT_PIP : PIP
  const pipFrame = (length: number) => ({
    box: sideways ? { width: pip.depth, height: length } : { width: length, height: pip.depth },
    content: {
      width: length,
      height: pip.depth,
      left: sideways ? (pip.depth - length) / 2 : 0,
      top: sideways ? (length - pip.depth) / 2 : 0,
      transform: [{ rotate: `${contentRotation}deg` }],
    },
  })
  const direction = stripDirection(contentRotation)
  const pipRun = edgeLength
    ? Math.max(edgeLength / 2 - CENTERED_NAME_HALF_WIDTH - spacing.xs, pip.depth)
    : undefined

  return (
    <View
      testID={`commander-strip-seat-${seatNumber}`}
      style={[themed($strip), stripEdge(contentRotation, spacing.xs), { flexDirection: direction }]}
    >
      <Pressable
        testID={`commander-inspect-seat-${seatNumber}`}
        accessibilityRole="button"
        accessibilityLabel={`${open ? "Close" : "Show"} commander damage for ${identity}, ${summary}`}
        accessibilityState={{ expanded: open, disabled: !!inspectDisabled }}
        disabled={inspectDisabled}
        hitSlop={8}
        onPress={onToggle}
        style={({ pressed }) => [
          themed($pips),
          { flexDirection: direction },
          pipRun !== undefined && (sideways ? { maxHeight: pipRun } : { maxWidth: pipRun }),
          open && { backgroundColor: overlayTint(foreground, 0.24) },
          pressed && { backgroundColor: overlayTint(foreground, 0.32) },
        ]}
      >
        {opponents.map(({ player, seat, total }) => {
          const lethal = total >= COMMANDER_LETHAL_DAMAGE
          const frame = pipFrame(total > 0 ? pip.length : pip.depth)
          return (
            <View
              key={player.id}
              testID={`commander-pip-seat-${seatNumber}-${player.id}`}
              style={[frame.box, total === 0 && themed($idlePip)]}
            >
              <View style={[themed($pipContent), frame.content]}>
                <View
                  style={[
                    themed($chip),
                    { backgroundColor: player.color, borderColor: overlayTint(foreground, 0.5) },
                  ]}
                >
                  <PlayerMark
                    seatNumber={seat}
                    shape={player.shape}
                    color={accessibleForeground(player.color)}
                    size={11}
                  />
                </View>
                {total > 0 ? (
                  <Text
                    text={String(total)}
                    weight={lethal ? "bold" : "medium"}
                    maxFontSizeMultiplier={1}
                    style={[themed($count), { color: foreground }, lethal && themed($lethalCount)]}
                  />
                ) : null}
              </View>
            </View>
          )
        })}
      </Pressable>
      <Pressable
        testID={`commander-mark-seat-${seatNumber}`}
        accessibilityRole="button"
        accessibilityLabel={`Assign commander damage from ${identity}`}
        accessibilityState={{ disabled: !!disabled }}
        disabled={disabled}
        hitSlop={8}
        onPress={onPressSword}
        style={({ pressed }) => [themed($sword), pressed && { opacity: 0.72 }]}
      >
        <PlayerMark
          seatNumber={seatNumber}
          shape={shape}
          color={foreground}
          rotation={contentRotation}
          insetSwordColor={color}
          size={36}
        />
      </Pressable>
    </View>
  )
}

function stripDirection(rotation: LifeCardContentRotation): ViewStyle["flexDirection"] {
  if (rotation === 90) return "column"
  if (rotation === -90) return "column-reverse"
  if (rotation === 180) return "row-reverse"
  return "row"
}

function stripEdge(rotation: LifeCardContentRotation, inset: number): ViewStyle {
  if (rotation === 90) return { left: inset, top: inset, bottom: inset }
  if (rotation === -90) return { right: inset, top: inset, bottom: inset }
  if (rotation === 180) return { top: inset, left: inset, right: inset }
  return { bottom: inset, left: inset, right: inset }
}

const $strip: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  zIndex: 10,
  justifyContent: "space-between",
  alignItems: "center",
})

const $pips: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexShrink: 1,
  flexWrap: "wrap",
  alignItems: "center",
  gap: spacing.xxs,
  padding: spacing.xxs,
  borderRadius: spacing.xs,
})

const $idlePip: ThemedStyle<ViewStyle> = () => ({ opacity: 0.45 })

const $pipContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  position: "absolute",
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: spacing.xxxs,
})

const $chip: ThemedStyle<ViewStyle> = () => ({
  width: 18,
  height: 18,
  borderRadius: 9,
  borderWidth: 1,
  alignItems: "center",
  justifyContent: "center",
})

const $count: ThemedStyle<TextStyle> = () => ({
  fontSize: 16,
  lineHeight: 20,
  fontVariant: ["tabular-nums"],
})

const $lethalCount: ThemedStyle<TextStyle> = () => ({ textDecorationLine: "underline" })

const $sword: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexShrink: 0,
  width: spacing.xl + spacing.sm,
  height: spacing.xl + spacing.sm,
  alignItems: "center",
  justifyContent: "center",
})
