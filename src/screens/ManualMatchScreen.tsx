import { useState } from "react"
import type { ViewStyle } from "react-native"
import { ScrollView, View } from "react-native"
import { useMutation } from "convex/react"

import { AlertNote } from "@/components/AlertNote"
import { BottomActionBar } from "@/components/BottomActionBar"
import { Button } from "@/components/Button"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { EmptyState } from "@/components/EmptyState"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import type { RemoteValue } from "@/features/async/remoteState"
import type { CloudAccess } from "@/features/auth/CloudScreen"
import { playFormatLabel } from "@/features/game/playSystems"
import { appLocale, type TxKeyPath } from "@/i18n"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { $styles } from "@/theme/styles"
import type { ThemedStyle } from "@/theme/types"
import { convexErrorMessage } from "@/utils/convexError"

import { manualMatchScore, type ManualMatchSeat } from "./historyEntries"
import { api } from "../../convex/_generated/api"
import type { ManualMatchView } from "../../convex/history"

export type ManualMatchState =
  RemoteValue<ManualMatchView | null> | { status: "unavailable"; retry: () => void }

export interface ManualMatchScreenProps {
  access: CloudAccess
  match: ManualMatchState
  onBack: () => void
  onDeleted: () => void
}

const OUTCOME_BADGES = {
  win: { labelTx: "play:summary.badge.win", accessibilityTx: "play:history.outcome.win" },
  loss: { labelTx: "play:summary.badge.loss", accessibilityTx: "play:summary.outcome.loss" },
  draw: { labelTx: "play:summary.badge.draw", accessibilityTx: "play:summary.outcome.draw" },
  unknown: {
    labelTx: "play:summary.badge.unrecorded",
    accessibilityTx: "play:summary.outcome.unrecorded",
  },
} as const satisfies Record<string, { labelTx: TxKeyPath; accessibilityTx: TxKeyPath }>

function dateLabel(finishedAt: number) {
  return new Date(finishedAt).toLocaleDateString(appLocale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function matchMetaLine(match: ManualMatchView) {
  return [
    translate("play:newGame.bestOfCount", { bestOf: match.bestOf }),
    match.system && match.format ? playFormatLabel(match.system, match.format) : undefined,
    [
      match.eventName,
      match.roundNumber === undefined
        ? undefined
        : translate("play:manualMatch.round", { round: match.roundNumber }),
    ]
      .filter(Boolean)
      .join(" "),
    dateLabel(match.finishedAt),
  ]
    .filter(Boolean)
    .join(" · ")
}

function SeatRow({ seat }: { seat: ManualMatchSeat }) {
  const { theme, themed } = useAppTheme()
  const badge = OUTCOME_BADGES[seat.outcome ?? "unknown"]
  const badgeTone =
    seat.outcome === "win"
      ? theme.colors.tint
      : seat.outcome === "loss"
        ? theme.colors.error
        : theme.colors.textDim
  const games =
    seat.gamesWon === undefined
      ? undefined
      : seat.gamesDrawn
        ? translate("play:manualMatch.gamesWonDrawn", {
            won: seat.gamesWon,
            drawn: seat.gamesDrawn,
          })
        : translate("play:manualMatch.gamesWon", { won: seat.gamesWon })
  return (
    <View
      testID={`match-seat-${seat.seat}`}
      accessibilityLabel={`${translate(badge.accessibilityTx)} · ${seat.displayName}`}
      style={themed($seatRow)}
    >
      <View style={[themed($badge), { borderColor: badgeTone }]}>
        <Text weight="bold" size="sm" tx={badge.labelTx} style={{ color: badgeTone }} />
      </View>
      <View style={$styles.flex1}>
        <Text
          size="sm"
          weight="medium"
          text={
            seat.mine
              ? translate("play:manualMatch.you", { name: seat.displayName })
              : seat.displayName
          }
        />
        {seat.deckName ? <Text size="xxs" tone="dim" text={seat.deckName} /> : null}
      </View>
      {games ? <Text size="xs" tone="dim" text={games} /> : null}
    </View>
  )
}

export function ManualMatchScreen({ access, match, onBack, onDeleted }: ManualMatchScreenProps) {
  const { theme, themed } = useAppTheme()
  const deleteMatch = useMutation(api.matches.deleteManualMatch)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const value = match.status === "ready" ? match.value : undefined

  async function remove() {
    if (!value) return
    setBusy(true)
    setError(undefined)
    try {
      await deleteMatch({ matchId: value.matchId })
      setConfirming(false)
      onDeleted()
    } catch (cause) {
      setConfirming(false)
      setError(convexErrorMessage(cause, translate("play:manualMatch.deleteFailed")))
      setBusy(false)
    }
  }

  const score = value ? manualMatchScore(value.seats) : undefined
  return (
    <Screen
      preset="fixed"
      safeAreaEdges={["bottom"]}
      backgroundColor={theme.colors.surface}
      contentContainerStyle={$screen}
    >
      <Header
        titleTx="play:manualMatch.title"
        backgroundColor={theme.colors.surface}
        leftTx="common:back"
        onLeftPress={busy ? undefined : onBack}
      />
      {!access.ready && !access.loading ? (
        <EmptyState
          imageSource={null}
          headingTx="play:manualMatch.signInHeading"
          content={access.message}
          button={access.actionLabel ?? translate("play:manualMatch.signIn")}
          buttonOnPress={access.request}
        />
      ) : match.status === "unavailable" ? (
        <EmptyState
          imageSource={null}
          headingTx="play:manualMatch.unavailableHeading"
          contentTx="play:summary.unavailableContent"
          buttonTx="common:tryAgain"
          buttonOnPress={match.retry}
        />
      ) : match.status === "loading" || access.loading ? (
        <View
          testID="match-loading"
          accessibilityRole="progressbar"
          accessibilityLabel={translate("play:manualMatch.loading")}
          style={themed($content)}
        >
          <Text size="xs" tone="dim" tx="play:manualMatch.loadingEllipsis" />
        </View>
      ) : !value ? (
        <EmptyState
          imageSource={null}
          headingTx="play:manualMatch.notFoundHeading"
          contentTx="play:manualMatch.notFoundContent"
          buttonTx="common:back"
          buttonOnPress={onBack}
        />
      ) : (
        <>
          <ScrollView contentContainerStyle={themed($content)} showsVerticalScrollIndicator={false}>
            <Text size="xs" tone="dim" text={matchMetaLine(value)} />
            {score ? <Text preset="heading" testID="match-score" text={score} /> : null}
            <View>
              {value.seats.map((seat) => (
                <SeatRow key={seat.seat} seat={seat} />
              ))}
            </View>
          </ScrollView>
          <BottomActionBar>
            {error ? <AlertNote text={error} /> : null}
            <Button
              testID="match-delete"
              tx="play:manualMatch.deleteResult"
              disabled={busy}
              onPress={() => setConfirming(true)}
            />
          </BottomActionBar>
          <ConfirmDialog
            visible={confirming}
            title={translate("play:manualMatch.deleteTitle")}
            backdropAccessibilityLabel={translate("play:manualMatch.cancelDelete")}
            message={translate("play:manualMatch.deleteMessage")}
            confirmText={translate("common:delete")}
            destructive
            busy={busy}
            dialogTestID="match-delete-confirm"
            confirmTestID="match-delete-confirm-action"
            cancelTestID="match-delete-cancel"
            onClose={() => setConfirming(false)}
            onConfirm={remove}
          />
        </>
      )}
    </Screen>
  )
}

const BADGE_SIZE = 32

const $screen: ViewStyle = { flex: 1 }
const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
  paddingHorizontal: spacing.md,
  paddingTop: spacing.sm,
  paddingBottom: spacing.lg,
  width: "100%",
  maxWidth: 720,
  alignSelf: "center",
})
const $seatRow: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  paddingVertical: spacing.sm,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $badge: ThemedStyle<ViewStyle> = () => ({
  width: BADGE_SIZE,
  height: BADGE_SIZE,
  borderRadius: BADGE_SIZE / 2,
  borderWidth: 1,
  alignItems: "center",
  justifyContent: "center",
})
