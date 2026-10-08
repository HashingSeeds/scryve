import { useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { Pressable, ScrollView, View } from "react-native"

import { Button } from "@/components/Button"
import { CHOICE_RADIUS } from "@/components/ChoiceButton"
import { DialogCard, $dialogActions } from "@/components/DialogCard"
import { SelectField } from "@/components/SelectField"
import { Text } from "@/components/Text"
import { useAuthAccess } from "@/features/auth/AuthContext"
import { entryPlayerNames, localHistoryEntry } from "@/screens/historyEntries"
import { useAppTheme } from "@/theme/context"
import { $styles } from "@/theme/styles"
import type { ThemedStyle } from "@/theme/types"
import { accessibleForeground } from "@/utils/colorContrast"

import { claimableLocalGames } from "./localGameClaims"
import { localGameRepository, type LocalGameRepository } from "./localPersistence"
import type { LocalGameSummary, PlayerId } from "./types"

function resultLabel(game: LocalGameSummary) {
  const entry = localHistoryEntry(game)
  if (entry.outcome === "draw") return "Draw"
  return entry.winnerNames?.length ? `Won by ${entry.winnerNames.join(" & ")}` : "No result"
}

function whenLabel(timestamp: number) {
  const date = new Date(timestamp)
  return `${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
}

// why: the result leads so a narrow row truncates the format, not the fact that decides the "This is me" seat.
function detailLine(game: LocalGameSummary) {
  return [resultLabel(game), whenLabel(game.finishedAt), localHistoryEntry(game).format].join(" · ")
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
  const [candidates] = useState(() => claimableLocalGames(repository.loadHistory(), ownerId))
  const [open, setOpen] = useState(true)
  const [excluded, setExcluded] = useState<readonly string[]>([])
  const [meSeats, setMeSeats] = useState<Readonly<Record<string, PlayerId | undefined>>>({})
  if (!open || candidates.length === 0) return null
  const selectedCount = candidates.length - excluded.length

  function toggle(id: string) {
    setExcluded((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    )
  }

  function confirm() {
    repository.resolveClaims(
      ownerId,
      candidates.map((game) => ({
        id: game.id,
        claim: !excluded.includes(game.id),
        mePlayerId: meSeats[game.id],
      })),
    )
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
        {candidates.map((game) => {
          const selected = !excluded.includes(game.id)
          const names = entryPlayerNames(localHistoryEntry(game)).join(" · ")
          return (
            <View key={game.id} style={themed($game)}>
              <Pressable
                testID={`claim-game-${game.id}`}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={`${names}, ${detailLine(game)}`}
                style={themed($row)}
                onPress={() => toggle(game.id)}
              >
                <View style={[themed($check), selected && themed($checkOn)]}>
                  {selected ? <Text size="xxs" text="✓" style={themed($checkMark)} /> : null}
                </View>
                <View style={$styles.flex1}>
                  <Text size="sm" weight="medium" numberOfLines={2} text={names} />
                  <Text size="xxs" numberOfLines={1} style={themed($dim)} text={detailLine(game)} />
                </View>
              </Pressable>
              {selected ? (
                <SelectField
                  testID={`claim-me-seat-${game.id}`}
                  label="This is me"
                  value={meSeats[game.id]}
                  placeholder="No seat"
                  clearLabel="No seat"
                  options={game.players.map((player) => ({ id: player.id, label: player.name }))}
                  onSelect={(id) =>
                    setMeSeats((current) => ({
                      ...current,
                      [game.id]: game.players.find((player) => player.id === id)?.id,
                    }))
                  }
                />
              ) : null}
            </View>
          )
        })}
      </ScrollView>
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

/** why: shows whenever a signed-in account has signed-out games it has not decided on; closing it only defers to the next launch. */
export function LocalGameClaimPrompt({
  repository = localGameRepository,
}: {
  repository?: LocalGameRepository
}) {
  const auth = useAuthAccess()
  const ownerId = auth.configured && auth.isLoaded && auth.isSignedIn ? auth.userId : undefined
  if (!ownerId || auth.authVisible) return null
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
