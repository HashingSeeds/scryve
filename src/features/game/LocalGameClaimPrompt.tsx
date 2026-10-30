import { useEffect, useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { Pressable, ScrollView, View } from "react-native"
import { usePathname } from "expo-router"

import { AlertNote } from "@/components/AlertNote"
import { Button } from "@/components/Button"
import { DialogCard, $dialogActions } from "@/components/DialogCard"
import { PlayerMark } from "@/components/PlayerMark"
import { Text } from "@/components/Text"
import { useAuthAccess } from "@/features/auth/AuthContext"
import { appLocale } from "@/i18n"
import { translate } from "@/i18n/translate"
import { entryPlayerNames, localHistoryEntry } from "@/screens/historyEntries"
import { useAppTheme } from "@/theme/context"
import { $styles } from "@/theme/styles"
import type { ThemedStyle } from "@/theme/types"
import { accessibleForeground } from "@/utils/colorContrast"

import { matchScoreAfter, matchScoreLabel, PLAYER_COLORS } from "./domain"
import { claimableLocalUnits, type ClaimUnit } from "./localGameClaims"
import { localGameRepository, type LocalGameRepository } from "./localPersistence"
import type { GamePlayer } from "./types"
import {
  PLAYER_MARK_SHAPES,
  shapeForSeat,
  type PlayerMarkShape,
} from "../../../convex/lib/appearance"

const CHECK_MARK = "✓"

function latestGame(unit: ClaimUnit) {
  return unit.games[unit.games.length - 1]
}

function resultLabel(unit: ClaimUnit) {
  const game = latestGame(unit)
  if (unit.match) {
    const winner = unit.match.result?.outcomes.indexOf("win") ?? -1
    const standing = {
      bestOf: unit.match.bestOf,
      score: matchScoreLabel(matchScoreAfter(game)),
    }
    if (winner >= 0)
      return translate("board:claim.matchWonBy", {
        ...standing,
        name: game.players[winner]?.name ?? "?",
      })
    return unit.match.result
      ? translate("board:claim.matchDraw", standing)
      : translate("board:claim.matchStanding", standing)
  }
  const entry = localHistoryEntry(game)
  if (entry.outcome === "draw") return translate("board:claim.draw")
  return entry.winnerNames?.length
    ? translate("board:claim.wonBy", { names: entry.winnerNames.join(" & ") })
    : translate("board:claim.noResult")
}

function whenLabel(timestamp: number) {
  const date = new Date(timestamp)
  return `${date.toLocaleDateString(appLocale, { month: "short", day: "numeric" })} ${date.toLocaleTimeString(appLocale, { hour: "numeric", minute: "2-digit" })}`
}

function detailLine(unit: ClaimUnit) {
  const game = latestGame(unit)
  return [resultLabel(unit), whenLabel(game.finishedAt), localHistoryEntry(game).format].join(" · ")
}

function gameCount(units: readonly ClaimUnit[]) {
  return units.reduce((sum, unit) => sum + unit.games.length, 0)
}

type SeatMark = { color: string; shape: PlayerMarkShape; label: string }

// why: the same fallbacks createLocalGame uses, so older games without a stored mark match their board.
function seatMark(seat: number, player?: Pick<GamePlayer, "name" | "color" | "shape">): SeatMark {
  const shape = player?.shape ?? shapeForSeat(seat + 1, PLAYER_MARK_SHAPES)
  return {
    color: player?.color || PLAYER_COLORS[seat],
    shape,
    label: translate("board:claim.seatMark", {
      name: player?.name ?? translate("board:claim.seatFallback", { seat: seat + 1 }),
      shape: translate(`board:shape.${shape}`),
    }),
  }
}

function seatsFor(units: readonly ClaimUnit[], seat: number | undefined) {
  return Object.fromEntries(
    units.map((unit) => [
      unit.id,
      seat !== undefined && seat < latestGame(unit).players.length ? seat : undefined,
    ]),
  )
}

function ClaimPicker({
  ownerId,
  repository,
}: {
  ownerId: string
  repository: LocalGameRepository
}) {
  const { themed } = useAppTheme()
  const [candidates] = useState(() =>
    claimableLocalUnits(repository.loadHistory(), ownerId, repository.loadDeferredClaims(ownerId)),
  )
  const [open, setOpen] = useState(true)
  const [excluded, setExcluded] = useState<readonly string[]>([])
  const [allSeat, setAllSeat] = useState<number>()
  const [meSeats, setMeSeats] = useState<Readonly<Record<string, number | undefined>>>({})
  const [error, setError] = useState<string>()
  if (!open || candidates.length === 0) return null
  const selectedCount = gameCount(candidates.filter((unit) => !excluded.includes(unit.id)))
  const mostSeats = Math.max(...candidates.map((unit) => latestGame(unit).players.length))

  function chooseAllSeat(seat: number | undefined) {
    setAllSeat(seat)
    setMeSeats(seatsFor(candidates, seat))
  }

  function toggle(id: string) {
    setExcluded((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    )
  }

  // why: a failed write only means the prompt may return, so it still closes.
  function decideLater() {
    try {
      repository.deferClaims(
        ownerId,
        candidates.flatMap((unit) => unit.games.map((game) => game.id)),
      )
    } catch {}
    setOpen(false)
  }

  function confirm() {
    try {
      repository.resolveClaims(
        ownerId,
        candidates.map((unit) => ({
          id: unit.id,
          claim: !excluded.includes(unit.id),
          meSeat: meSeats[unit.id],
        })),
      )
    } catch {
      setError(translate("board:claim.saveFailed"))
      return
    }
    setOpen(false)
  }

  return (
    <DialogCard
      visible
      wide
      onClose={decideLater}
      backdropTestID="claim-games-backdrop"
      backdropAccessibilityLabel={translate("board:claim.decideLater")}
      dialogTestID="claim-games-dialog"
      dialogAccessibilityRole="alert"
      accessibilityViewIsModal
    >
      <View style={themed($header)}>
        <Text preset="subheading" tx="board:claim.title" />
        <Text size="xs" tone="dim" tx="board:claim.body" />
      </View>
      {candidates.length > 1 ? (
        <SeatMarks
          testID="claim-me-all"
          label={translate("board:claim.youWere")}
          marks={Array.from({ length: mostSeats }, (_, seat) => seatMark(seat))}
          value={allSeat}
          onSelect={chooseAllSeat}
        />
      ) : null}
      <ScrollView style={$list} contentContainerStyle={themed($rows)}>
        {candidates.map((unit) => {
          const selected = !excluded.includes(unit.id)
          const game = latestGame(unit)
          const names = entryPlayerNames(localHistoryEntry(game)).join(" · ")
          const meSeat = meSeats[unit.id]
          return (
            <View key={unit.id} style={themed($game)}>
              <Pressable
                testID={`claim-game-${unit.id}`}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={translate("board:claim.gameLabel", {
                  names,
                  detail: detailLine(unit),
                })}
                style={themed($row)}
                onPress={() => toggle(unit.id)}
              >
                <View style={[themed($check), selected && themed($checkOn)]}>
                  {selected ? (
                    <Text size="xxs" text={CHECK_MARK} style={themed($checkMark)} />
                  ) : null}
                </View>
                <View style={$styles.flex1}>
                  <Text size="sm" weight="medium" numberOfLines={2} text={names} />
                  <Text size="xxs" numberOfLines={1} tone="dim" text={detailLine(unit)} />
                </View>
              </Pressable>
              {selected ? (
                <SeatMarks
                  testID={`claim-me-${unit.id}`}
                  label={candidates.length === 1 ? translate("board:claim.youWere") : undefined}
                  marks={game.players.map((player, seat) => seatMark(seat, player))}
                  value={meSeat}
                  style={themed($gameMarks)}
                  onSelect={(seat) => setMeSeats((current) => ({ ...current, [unit.id]: seat }))}
                />
              ) : null}
            </View>
          )
        })}
      </ScrollView>
      <Text size="xxs" tone="dim" tx="board:claim.seatNote" />
      {error ? <AlertNote text={error} /> : null}
      <View style={themed($dialogActions)}>
        <Button
          testID="claim-games-dismiss"
          tx="board:claim.notNow"
          style={themed($action)}
          onPress={decideLater}
        />
        <Button
          testID="claim-games-confirm"
          text={
            selectedCount === 0
              ? translate("board:claim.keepOnDevice")
              : translate("board:claim.addGames", { count: selectedCount })
          }
          preset="primary"
          style={themed($action)}
          onPress={confirm}
        />
      </View>
    </DialogCard>
  )
}

function SeatMarks({
  testID,
  label,
  marks,
  value,
  style,
  onSelect,
}: {
  testID: string
  label?: string
  marks: readonly SeatMark[]
  value: number | undefined
  style?: ViewStyle
  onSelect: (seat: number | undefined) => void
}) {
  const { themed } = useAppTheme()
  return (
    <View style={[themed($seatMarks), style]}>
      {label ? <Text size="xs" weight="medium" text={label} /> : null}
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={label ?? translate("board:claim.youWere")}
        style={$markRow}
      >
        {marks.map((mark, seat) => {
          const chosen = seat === value
          return (
            <Pressable
              key={seat}
              testID={`${testID}-seat-${seat}`}
              accessibilityRole="radio"
              accessibilityLabel={mark.label}
              aria-checked={chosen}
              style={[
                themed($mark),
                chosen && themed($markChosen),
                value !== undefined && !chosen && $markFaded,
              ]}
              onPress={() => onSelect(chosen ? undefined : seat)}
            >
              <PlayerMark
                seatNumber={seat + 1}
                shape={mark.shape}
                color={mark.color}
                size={MARK_SIZE}
              />
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

function useLocalGameRunning(repository: LocalGameRepository) {
  const pathname = usePathname()
  const [finishCount, setFinishCount] = useState(0)
  const [running, setRunning] = useState(() => repository.hasRunningGame())
  useEffect(
    () => repository.onGameFinished(() => setFinishCount((count) => count + 1)),
    [repository],
  )
  useEffect(() => {
    setRunning(repository.hasRunningGame())
  }, [finishCount, pathname, repository])
  return running
}

function useClaimsReopened(repository: LocalGameRepository) {
  const [count, setCount] = useState(0)
  useEffect(() => repository.onClaimsReopened(() => setCount((value) => value + 1)), [repository])
  return count
}

export function LocalGameClaimPrompt({
  repository = localGameRepository,
}: {
  repository?: LocalGameRepository
}) {
  const auth = useAuthAccess()
  const running = useLocalGameRunning(repository)
  const reopened = useClaimsReopened(repository)
  const ownerId = auth.configured && auth.isLoaded && auth.isSignedIn ? auth.userId : undefined
  useEffect(() => {
    if (!ownerId) return
    try {
      repository.repairClaimedDetails(ownerId)
    } catch {}
  }, [ownerId, repository])
  if (!ownerId || auth.authVisible || running) return null
  return <ClaimPicker key={`${ownerId}:${reopened}`} ownerId={ownerId} repository={repository} />
}

const $header: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xxs })
const $list: ViewStyle = { flexShrink: 1 }
const $rows: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.sm })
const $game: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xxs })
const CHECK_SIZE = 22
const MARK_SIZE = 28
const MARK_TARGET = 44
const $gameMarks: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginLeft: CHECK_SIZE + spacing.sm,
})
const $seatMarks: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xxs })
const $markRow: ViewStyle = {
  flexDirection: "row",
  flexWrap: "wrap",
  marginHorizontal: -(MARK_TARGET - MARK_SIZE) / 2,
}
const $mark: ThemedStyle<ViewStyle> = ({ colors, radius }) => ({
  width: MARK_TARGET,
  height: MARK_TARGET,
  alignItems: "center",
  justifyContent: "center",
  borderRadius: radius.xl,
  borderWidth: 2,
  borderColor: colors.transparent,
})
const $markChosen: ThemedStyle<ViewStyle> = ({ colors }) => ({ borderColor: colors.tint })
const $markFaded: ViewStyle = { opacity: 0.35 }
const $row: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  minHeight: 44,
})
const $check: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: CHECK_SIZE,
  height: CHECK_SIZE,
  borderRadius: CHECK_SIZE / 2,
  borderWidth: 2,
  borderColor: colors.border,
  alignItems: "center",
  justifyContent: "center",
})
const $checkOn: ThemedStyle<ViewStyle> = ({ colors }) => ({
  borderColor: colors.tint,
  backgroundColor: colors.tint,
})
const $checkMark: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: accessibleForeground(colors.tint),
  lineHeight: 18,
})
const $action: ThemedStyle<ViewStyle> = ({ radius }) => ({
  flex: 1,
  minHeight: 48,
  borderRadius: radius.xl,
})
