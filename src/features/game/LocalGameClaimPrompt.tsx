import { useEffect, useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { Pressable, ScrollView, View } from "react-native"
import { usePathname } from "expo-router"

import { AlertNote } from "@/components/AlertNote"
import { Button } from "@/components/Button"
import { CHOICE_RADIUS } from "@/components/ChoiceButton"
import { DialogCard, $dialogActions } from "@/components/DialogCard"
import { SelectField } from "@/components/SelectField"
import { Text } from "@/components/Text"
import { useAuthAccess } from "@/features/auth/AuthContext"
import { useLegalConsentSettled } from "@/features/legal/LegalConsentGate"
import { entryPlayerNames, localHistoryEntry } from "@/screens/historyEntries"
import { useAppTheme } from "@/theme/context"
import { $styles } from "@/theme/styles"
import type { ThemedStyle } from "@/theme/types"
import { accessibleForeground } from "@/utils/colorContrast"

import { hasLocalGameStarted, matchScoreAfter, matchScoreLabel } from "./domain"
import { claimableLocalUnits, type ClaimUnit } from "./localGameClaims"
import { localGameRepository, type LocalGameRepository } from "./localPersistence"

function latestGame(unit: ClaimUnit) {
  return unit.games[unit.games.length - 1]
}

function resultLabel(unit: ClaimUnit) {
  const game = latestGame(unit)
  if (unit.match) {
    const winner = unit.match.result?.outcomes.indexOf("win") ?? -1
    const standing = `Best of ${unit.match.bestOf} · ${matchScoreLabel(matchScoreAfter(game))}`
    if (winner >= 0) return `${standing} · Won by ${game.players[winner]?.name ?? "?"}`
    return unit.match.result ? `${standing} · Draw` : standing
  }
  const entry = localHistoryEntry(game)
  if (entry.outcome === "draw") return "Draw"
  return entry.winnerNames?.length ? `Won by ${entry.winnerNames.join(" & ")}` : "No result"
}

function whenLabel(timestamp: number) {
  const date = new Date(timestamp)
  return `${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
}

// why: the result leads so a narrow row truncates the format, not the fact that decides the "This is me" seat.
function detailLine(unit: ClaimUnit) {
  const game = latestGame(unit)
  return [resultLabel(unit), whenLabel(game.finishedAt), localHistoryEntry(game).format].join(" · ")
}

function gameCount(units: readonly ClaimUnit[]) {
  return units.reduce((sum, unit) => sum + unit.games.length, 0)
}

function ClaimPicker({
  ownerId,
  repository,
}: {
  ownerId: string
  repository: LocalGameRepository
}) {
  const { themed } = useAppTheme()
  // why: read once per account; games finished while signed in are tagged at the finish and never qualify.
  const [candidates] = useState(() => claimableLocalUnits(repository.loadHistory(), ownerId))
  const [open, setOpen] = useState(true)
  const [excluded, setExcluded] = useState<readonly string[]>([])
  const [meSeats, setMeSeats] = useState<Readonly<Record<string, number | undefined>>>({})
  const [error, setError] = useState<string>()
  if (!open || candidates.length === 0) return null
  const selectedCount = gameCount(candidates.filter((unit) => !excluded.includes(unit.id)))

  function toggle(id: string) {
    setExcluded((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    )
  }

  // why: a failed write keeps the picker open; the index is authoritative, so retrying repairs whatever was left behind.
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
      setError("Could not save your choice. Try again.")
      return
    }
    setOpen(false)
  }

  return (
    <DialogCard
      visible
      wide
      onClose={() => setOpen(false)}
      backdropTestID="claim-games-backdrop"
      backdropAccessibilityLabel="Decide later"
      dialogTestID="claim-games-dialog"
      dialogAccessibilityRole="alert"
      accessibilityViewIsModal
    >
      <View style={themed($header)}>
        <Text preset="subheading" text="Add games to this account?" />
        <Text
          size="xs"
          style={themed($dim)}
          text="These games were played signed out. Selected games are added to this account. The rest stay on this device only."
        />
      </View>
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
                accessibilityLabel={`${names}, ${detailLine(unit)}`}
                style={themed($row)}
                onPress={() => toggle(unit.id)}
              >
                <View style={[themed($check), selected && themed($checkOn)]}>
                  {selected ? <Text size="xxs" text="✓" style={themed($checkMark)} /> : null}
                </View>
                <View style={$styles.flex1}>
                  <Text size="sm" weight="medium" numberOfLines={2} text={names} />
                  <Text size="xxs" numberOfLines={1} style={themed($dim)} text={detailLine(unit)} />
                </View>
              </Pressable>
              {selected ? (
                <SelectField
                  testID={`claim-me-seat-${unit.id}`}
                  label="This is me"
                  value={meSeat === undefined ? undefined : String(meSeat)}
                  placeholder="No seat"
                  clearLabel="No seat"
                  options={game.players.map((player, index) => ({
                    id: String(index),
                    label: player.name,
                  }))}
                  onSelect={(id) =>
                    setMeSeats((current) => ({
                      ...current,
                      [unit.id]: id === undefined ? undefined : Number(id),
                    }))
                  }
                />
              ) : null}
            </View>
          )
        })}
      </ScrollView>
      {error ? <AlertNote text={error} /> : null}
      <View style={themed($dialogActions)}>
        <Button
          testID="claim-games-dismiss"
          text="Not now"
          style={themed($action)}
          onPress={() => setOpen(false)}
        />
        <Button
          testID="claim-games-confirm"
          text={
            selectedCount === 0
              ? "Keep on device"
              : `Add ${selectedCount} game${selectedCount === 1 ? "" : "s"}`
          }
          preset="reversed"
          style={themed($action)}
          onPress={confirm}
        />
      </View>
    </DialogCard>
  )
}

// why: a game in progress is never interrupted; the check reruns when the route changes or a game ends, and otherwise on the next launch.
function useLocalGameRunning(repository: LocalGameRepository) {
  const pathname = usePathname()
  const [finishCount, setFinishCount] = useState(0)
  const [running, setRunning] = useState(() => isLocalGameRunning(repository))
  useEffect(
    () => repository.onGameFinished(() => setFinishCount((count) => count + 1)),
    [repository],
  )
  useEffect(() => {
    setRunning(isLocalGameRunning(repository))
  }, [finishCount, pathname, repository])
  return running
}

function isLocalGameRunning(repository: LocalGameRepository) {
  const game = repository.loadActiveGame()
  return game !== null && hasLocalGameStarted(game)
}

/** why: shows whenever a signed-in account with settled consent has signed-out games it has not decided on; closing it only defers to the next launch. */
export function LocalGameClaimPrompt({
  repository = localGameRepository,
}: {
  repository?: LocalGameRepository
}) {
  const auth = useAuthAccess()
  const consentSettled = useLegalConsentSettled()
  const running = useLocalGameRunning(repository)
  const ownerId = auth.configured && auth.isLoaded && auth.isSignedIn ? auth.userId : undefined
  // why: a claim whose detail write failed last time is finished here before the account's games are read again.
  useEffect(() => {
    if (!ownerId) return
    try {
      repository.repairClaimedDetails(ownerId)
    } catch {
      // why: storage is still failing; the next launch tries again and the index already holds the claim.
    }
  }, [ownerId, repository])
  if (!ownerId || auth.authVisible || !consentSettled || running) return null
  return <ClaimPicker key={ownerId} ownerId={ownerId} repository={repository} />
}

const $header: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xxs })
const $dim: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $list: ViewStyle = { flexShrink: 1 }
const $rows: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.sm })
const $game: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $row: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  minHeight: 44,
})
const $check: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 22,
  height: 22,
  borderRadius: 11,
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
const $action: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  minHeight: 48,
  borderRadius: CHOICE_RADIUS,
})
