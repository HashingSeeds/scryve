import { useState, type ReactNode } from "react"
import type { GestureResponderEvent, TextStyle, ViewStyle } from "react-native"
import { Platform, ScrollView, View } from "react-native"

import { AlertNote } from "@/components/AlertNote"
import { BOTTOM_LINK_HEIGHT, BottomActionBar } from "@/components/BottomActionBar"
import { Button } from "@/components/Button"
import { useCollapsingTitle } from "@/components/CollapsingTitle"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import {
  $dialogActions,
  $dialogButton,
  DialogCard,
  type DialogOrigin,
} from "@/components/DialogCard"
import { FilterChips } from "@/components/FilterChips"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Sheet } from "@/components/Sheet"
import { Text } from "@/components/Text"
import { Switch } from "@/components/Toggle/Switch"
import { useSheetPresence } from "@/components/useSheetPresence"
import { AppearancePicker } from "@/features/connected/AppearancePicker"
import {
  lobbyDetail,
  lobbyExitCopy,
  seatSummary,
  type LobbyExitAction,
} from "@/features/connected/connectedCopy"
import { InviteCard } from "@/features/connected/InviteCard"
import {
  LobbySeatList,
  type LobbyDeckState,
  type LobbyDeviceDecks,
  type LobbySeat,
} from "@/features/connected/LobbySeatList"
import { deckVersionLabel } from "@/features/decks/deckCopy"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { $styles } from "@/theme/styles"
import type { ThemedStyle } from "@/theme/types"

import {
  CONNECTED_PLAYER_MARK_SHAPES,
  isPlayerMarkShape,
  PRO_MARK_SHAPES,
  shapeForSeat,
  shownMarkShape,
  type PlayerAppearance,
} from "../../../convex/lib/appearance"
import { isTreacheryPlayerCount, type GameVariant } from "../../../convex/lib/treachery"

export interface LobbyViewLobby {
  playerCount: number
  startingLife: number
  ruleset: string
  system?: string
  format?: string
  variant?: GameVariant
  deckRequired?: boolean
  isHost: boolean
  players: LobbySeat[]
}

export interface LobbyViewProps {
  lobby: LobbyViewLobby
  heading?: { text: string; label: string }
  online: boolean
  offlineNotice: string
  exitOfflineNotice?: string
  error?: string
  starting: boolean
  savingSettings?: boolean
  leaving: boolean
  startLabel?: string
  onStart: () => void
  onReturnToGame?: () => void
  onExit: (action: LobbyExitAction) => Promise<boolean>
  onBack?: () => void
  onChangePlayerCount?: (playerCount: number) => void
  onChangeDeckRequired?: (deckRequired: boolean) => void
  invite?: { qrPayload: string | null; manualCode?: string; onShare?: () => void }
  decks?: {
    source: (render: (state: LobbyDeckState, device?: LobbyDeviceDecks) => ReactNode) => ReactNode
    selectingSeats: ReadonlySet<number>
    onSelect: (seat: number, deckVersionId?: string) => void
    onManage?: () => void
    onAddDeck?: () => void
  }
  appearance?: {
    saving: boolean
    proLocked: boolean
    foil: boolean
    save: (seat: number, draft: PlayerAppearance) => Promise<boolean>
    presentPaywall: () => Promise<void>
  }
  onReport?: (seat: LobbySeat) => void
  children?: ReactNode
}

const originOf = (event?: GestureResponderEvent): DialogOrigin | undefined =>
  event?.nativeEvent ? { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY } : undefined

export function LobbyView({
  lobby,
  heading,
  online,
  offlineNotice,
  exitOfflineNotice,
  error,
  starting,
  savingSettings = false,
  leaving,
  startLabel,
  onStart,
  onReturnToGame,
  onExit,
  onBack,
  onChangePlayerCount,
  onChangeDeckRequired,
  invite,
  decks,
  appearance,
  onReport,
  children,
}: LobbyViewProps) {
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  const { titleVisible, onScroll } = useCollapsingTitle()
  const [inviteOpen, setInviteOpen] = useState(false)
  const inviteSheet = useSheetPresence((inviteOpen && Boolean(invite)) || undefined)
  const [leaveAction, setLeaveAction] = useState<LobbyExitAction>()
  const [exitOrigin, setExitOrigin] = useState<DialogOrigin>()
  const [appearanceSeat, setAppearanceSeat] = useState<number>()
  const [appearanceDraft, setAppearanceDraft] = useState<PlayerAppearance>()
  const [appearanceOrigin, setAppearanceOrigin] = useState<DialogOrigin>()
  // why: on iOS the paywall can only present once the picker's modal has finished dismissing.
  const [paywall, setPaywall] = useState<"closed" | "waitingForDismiss" | "open">("closed")

  const claimedSeats = lobby.players.length
  const openSeats = Math.max(0, lobby.playerCount - claimedSeats)
  const everySeatClaimed = claimedSeats === lobby.playerCount
  const missingDeck = lobby.deckRequired && lobby.players.some((player) => !player.deckVersionId)
  const readyPlayers = lobby.players.filter(
    (player) => !player.away && (!lobby.deckRequired || Boolean(player.deckVersionId)),
  ).length
  const someoneAway = lobby.players.some((player) => player.away)
  const exitAction: LobbyExitAction = lobby.isHost ? "abandon" : "leave"
  const exitCopy = lobbyExitCopy(exitAction)
  const startBlocked =
    !everySeatClaimed || missingDeck || someoneAway || !online || starting || savingSettings
  const openExitCopy = leaveAction ? lobbyExitCopy(leaveAction) : undefined
  const detail = lobbyDetail(
    lobby.startingLife,
    lobby.ruleset,
    lobby.system,
    lobby.format,
    lobby.variant,
  )
  const takenAppearances = lobby.players
    .filter((player) => player.seat !== appearanceSeat)
    .flatMap((player) => {
      const free = isPlayerMarkShape(player.shape) ? player.shape : shapeForSeat(player.seat)
      // why: the server still holds a Pro player's free mark for installed clients, so both stay taken.
      return [...new Set([shownMarkShape(player) ?? free, free])].map((shape) => ({
        color: player.color,
        shape,
      }))
    })

  async function presentPaywall() {
    setPaywall("open")
    await appearance?.presentPaywall()
    setPaywall("closed")
  }

  function openPaywall() {
    if (Platform.OS === "ios") setPaywall("waitingForDismiss")
    else void presentPaywall()
  }

  async function saveAppearance() {
    if (!appearance || appearanceSeat === undefined || !appearanceDraft) return
    if (await appearance.save(appearanceSeat, appearanceDraft)) setAppearanceSeat(undefined)
  }

  async function confirmExit() {
    if (leaveAction && (await onExit(leaveAction))) setLeaveAction(undefined)
  }

  function seatList(deckState?: LobbyDeckState, deviceDecks?: LobbyDeviceDecks) {
    return (
      <LobbySeatList
        seats={lobby.players}
        openSeats={openSeats}
        totalSeats={lobby.playerCount}
        deckState={deckState}
        deviceDecks={deviceDecks}
        system={lobby.system}
        format={lobby.format}
        onManageDecks={decks?.onManage}
        onAddDeck={decks?.onAddDeck}
        versionLabel={deckVersionLabel}
        selectingDeckSeats={decks?.selectingSeats}
        deckRequired={Boolean(lobby.deckRequired)}
        onSelectVersion={decks?.onSelect}
        onEditAppearance={
          appearance
            ? (seat, event) => {
                setAppearanceOrigin(originOf(event))
                setAppearanceDraft({
                  color: seat.color,
                  shape: shownMarkShape(seat) ?? shapeForSeat(seat.seat),
                })
                setAppearanceSeat(seat.seat)
              }
            : undefined
        }
        onReport={onReport}
      />
    )
  }

  return (
    <Screen
      preset="fixed"
      safeAreaEdges={["bottom"]}
      backgroundColor={colors.surface}
      contentContainerStyle={themed($screen)}
    >
      <Header
        title={titleVisible ? translate("connected:lobby.title") : ""}
        leftTx={onBack ? "common:back" : undefined}
        backgroundColor={colors.surface}
        onLeftPress={onBack}
      />
      <ScrollView
        style={$styles.flex1}
        contentContainerStyle={themed($content)}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        <View style={themed($hero)}>
          <View style={themed($inviteSummary)}>
            <View style={$styles.flex1}>
              <Text preset="heading" text={heading?.text ?? translate("connected:lobby.title")} />
              <Text size="sm" style={themed($dimmed)} text={heading?.label ?? detail} />
            </View>
            {invite?.qrPayload || invite?.manualCode ? (
              <Button
                testID="open-invite-button"
                tx="connected:invite.label"
                style={themed($inviteButton)}
                onPress={() => setInviteOpen(true)}
              />
            ) : null}
          </View>
          {heading ? <Text size="xs" style={themed($dimmed)} text={detail} /> : null}
        </View>
        {lobby.isHost && (onChangePlayerCount || (onChangeDeckRequired && lobby.deckRequired)) ? (
          <View style={themed($section)}>
            <Text preset="subheading" accessibilityRole="header" tx="connected:lobby.players" />
            {onChangePlayerCount ? (
              <FilterChips
                testID="lobby-player-count"
                accessibilityLabel={translate("connected:lobby.playerCount")}
                selectedId={String(lobby.playerCount)}
                chips={[2, 3, 4, 5, 6].map((count) => ({
                  id: String(count),
                  label: String(count),
                  disabled:
                    !online ||
                    savingSettings ||
                    starting ||
                    lobby.players.some((player) => player.seat > count) ||
                    (lobby.variant === "treachery" && !isTreacheryPlayerCount(count)),
                }))}
                onSelect={(count) => onChangePlayerCount(Number(count))}
              />
            ) : null}
            {onChangeDeckRequired && lobby.deckRequired ? (
              <Switch
                testID="lobby-require-decks"
                labelTx="connected:decksRequired"
                value={Boolean(lobby.deckRequired)}
                disabled={!online || savingSettings || starting}
                onValueChange={onChangeDeckRequired}
              />
            ) : null}
          </View>
        ) : null}
        <View style={themed($section)}>
          <View style={themed($readinessHeading)}>
            <Text preset="subheading" accessibilityRole="header" tx="connected:lobby.title" />
            <Text
              size="xs"
              style={themed($dimmed)}
              tx="connected:lobby.readyCount"
              txOptions={{ ready: readyPlayers, total: lobby.playerCount }}
            />
          </View>
          <View style={themed($progressTrack)}>
            <View
              testID="lobby-readiness-progress"
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: lobby.playerCount, now: readyPlayers }}
              style={[
                themed($progressFill),
                { width: `${(readyPlayers / lobby.playerCount) * 100}%` },
              ]}
            />
          </View>
          {!lobby.isHost && decks && lobby.deckRequired ? (
            <Text size="xxs" style={themed($dimmed)} tx="connected:decksRequired" />
          ) : null}
          {decks ? decks.source(seatList) : seatList()}
        </View>
      </ScrollView>
      <BottomActionBar endsWithLink style={themed($surface)}>
        {error && !openExitCopy ? <AlertNote testID="connected-action-error" text={error} /> : null}
        {lobby.isHost && !online ? (
          <AlertNote testID="connected-start-offline" text={offlineNotice} />
        ) : null}
        {onReturnToGame ? (
          <Button
            testID="return-to-game-button"
            tx="connected:nearby.backToGame"
            preset="primary"
            style={themed($primaryAction)}
            onPress={onReturnToGame}
          />
        ) : lobby.isHost ? (
          <>
            <Button
              testID="start-connected-game-button"
              text={
                starting
                  ? translate("connected:lobby.starting")
                  : (startLabel ?? translate("play:startGame"))
              }
              preset="primary"
              style={themed($primaryAction)}
              disabled={startBlocked}
              onPress={onStart}
            />
            {!everySeatClaimed && online ? (
              <Text
                size="xxs"
                style={themed($actionHint)}
                text={seatSummary(claimedSeats, lobby.playerCount)}
              />
            ) : null}
            {missingDeck && online ? (
              <Text size="xxs" style={themed($actionHint)} tx="connected:lobby.waitingForDecks" />
            ) : null}
          </>
        ) : (
          <Text size="sm" style={themed($actionHint)} tx="connected:waitingForHost" />
        )}
        <Button
          testID={`${exitAction}-connected-lobby-button`}
          text={exitCopy.confirmText}
          style={themed($secondaryAction)}
          textStyle={themed($secondaryActionText)}
          onPress={(event) => {
            setExitOrigin(originOf(event))
            setLeaveAction(exitAction)
          }}
        />
      </BottomActionBar>
      {inviteSheet.shown && invite ? (
        <Sheet
          visible={inviteSheet.visible}
          onClose={() => setInviteOpen(false)}
          onDismissed={inviteSheet.onDismissed}
          testID="invite-dialog"
        >
          <Text preset="subheading" tx="connected:invite.title" />
          <InviteCard
            qrPayload={invite.qrPayload}
            manualCode={invite.manualCode}
            onShare={invite.onShare}
          />
          <Button tx="common:close" onPress={() => setInviteOpen(false)} />
        </Sheet>
      ) : null}
      {leaveAction && openExitCopy ? (
        <ConfirmDialog
          visible
          origin={exitOrigin}
          title={openExitCopy.title}
          message={openExitCopy.message}
          confirmText={openExitCopy.confirmText}
          destructive={leaveAction === "abandon"}
          busy={leaving}
          confirmDisabled={!online && exitOfflineNotice !== undefined}
          dialogTestID="connected-lobby-leave-confirmation"
          confirmTestID={`confirm-connected-lobby-${leaveAction}-button`}
          cancelTestID={`cancel-connected-lobby-${leaveAction}-button`}
          backdropTestID="connected-lobby-leave-backdrop"
          backdropAccessibilityLabel={translate("connected:lobby.keepOpen")}
          notice={
            error ? (
              <AlertNote testID="connected-action-error" text={error} />
            ) : !online && exitOfflineNotice ? (
              <AlertNote testID="connected-lobby-exit-offline" text={exitOfflineNotice} />
            ) : null
          }
          onConfirm={() => void confirmExit()}
          onClose={() => setLeaveAction(undefined)}
        />
      ) : null}
      {appearance && appearanceSeat !== undefined && appearanceDraft ? (
        <DialogCard
          visible={paywall === "closed"}
          onDismissed={paywall === "waitingForDismiss" ? () => void presentPaywall() : undefined}
          onClose={() => setAppearanceSeat(undefined)}
          closeDisabled={appearance.saving}
          origin={appearanceOrigin}
          backdropTestID="lobby-appearance-backdrop"
          backdropAccessibilityLabel={translate("connected:lobby.appearance.close")}
          dialogTestID="lobby-appearance-dialog"
          accessibilityViewIsModal
        >
          <Text preset="subheading" tx="connected:lobby.appearance.title" />
          <AppearancePicker
            value={appearanceDraft}
            taken={takenAppearances}
            shapes={CONNECTED_PLAYER_MARK_SHAPES}
            proShapes={PRO_MARK_SHAPES}
            proLocked={appearance.proLocked}
            foil={appearance.foil}
            onLockedPress={openPaywall}
            onChange={setAppearanceDraft}
          />
          <View style={themed($dialogActions)}>
            <Button
              testID="cancel-appearance-button"
              tx="common:cancel"
              style={themed($dialogButton)}
              disabled={appearance.saving}
              onPress={() => setAppearanceSeat(undefined)}
            />
            <Button
              testID="save-appearance-button"
              tx={appearance.saving ? "connected:saving" : "common:save"}
              preset="primary"
              style={themed($dialogButton)}
              disabled={appearance.saving}
              onPress={() => void saveAppearance()}
            />
          </View>
        </DialogCard>
      ) : null}
      {children}
    </Screen>
  )
}

export function LobbyClosedScreen({
  status,
  onClose,
}: {
  status: "abandoned" | "finished"
  onClose: () => void
}) {
  const { theme } = useAppTheme()
  return (
    <Screen preset="fixed" backgroundColor={theme.colors.surface}>
      <DialogCard
        visible
        onClose={onClose}
        backdropAccessibilityLabel={translate("connected:lobby.closed.close")}
        dialogAccessibilityRole="alert"
        accessibilityViewIsModal
      >
        <Text preset="subheading" tx="connected:lobby.closed.title" />
        <Text
          tx={
            status === "abandoned"
              ? "connected:lobby.closed.abandoned"
              : "connected:lobby.closed.ended"
          }
        />
        <Button tx="connected:lobby.closed.ok" onPress={onClose} />
      </DialogCard>
    </Screen>
  )
}

function LobbySkeleton() {
  const { themed } = useAppTheme()
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={translate("connected:lobby.loadingLabel")}
      style={themed($skeleton)}
    >
      <View style={themed($skeletonInvite)} />
      {Array.from({ length: 2 }).map((_, index) => (
        <View key={index} testID="lobby-skeleton-seat" style={themed($skeletonSeat)} />
      ))}
    </View>
  )
}

export function LobbyStatusScreen({
  message,
  error = false,
  retry,
  onBack,
}: {
  message: string
  error?: boolean
  retry?: () => void
  onBack?: () => void
}) {
  const { themed, theme } = useAppTheme()
  return (
    <Screen
      preset="fixed"
      safeAreaEdges={["bottom"]}
      backgroundColor={theme.colors.surface}
      contentContainerStyle={themed($screen)}
    >
      <Header
        title=""
        leftTx={onBack ? "common:back" : undefined}
        backgroundColor={theme.colors.surface}
        onLeftPress={onBack}
      />
      <ScrollView
        style={$styles.flex1}
        contentContainerStyle={themed($content)}
        scrollEnabled={false}
      >
        <View style={themed($hero)}>
          <Text preset="heading" tx="connected:lobby.title" />
          {error ? (
            <AlertNote text={message} />
          ) : (
            <Text
              accessibilityRole="progressbar"
              accessibilityLiveRegion="polite"
              size="sm"
              style={themed($dimmed)}
              text={message}
            />
          )}
        </View>
        <LobbySkeleton />
        {error && retry ? (
          <Button testID="retry-lobby-button" tx="common:tryAgain" onPress={retry} />
        ) : null}
      </ScrollView>
      <BottomActionBar style={themed($surface)}>
        <Button tx="play:startGame" preset="primary" style={themed($primaryAction)} disabled />
      </BottomActionBar>
    </Screen>
  )
}

const $screen: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flex: 1,
  backgroundColor: colors.surface,
})
const $surface: ThemedStyle<ViewStyle> = ({ colors }) => ({ backgroundColor: colors.surface })
const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexGrow: 1,
  gap: spacing.md,
  padding: spacing.lg,
  paddingBottom: spacing.xl,
})
const $hero: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xxs })
const $section: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $inviteSummary: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
})
const $inviteButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 44,
  paddingVertical: spacing.xxs,
  paddingHorizontal: spacing.md,
})
const $readinessHeading: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "baseline",
  justifyContent: "space-between",
})
const $progressTrack: ThemedStyle<ViewStyle> = ({ colors }) => ({
  height: 4,
  overflow: "hidden",
  backgroundColor: colors.separator,
})
const $progressFill: ThemedStyle<ViewStyle> = ({ colors }) => ({
  height: "100%",
  backgroundColor: colors.tint,
})
const $dimmed: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $primaryAction: ThemedStyle<ViewStyle> = () => ({ minHeight: 52 })
const $secondaryAction: ThemedStyle<ViewStyle> = ({ colors }) => ({
  minHeight: BOTTOM_LINK_HEIGHT,
  borderWidth: 0,
  backgroundColor: colors.transparent,
})
const $secondaryActionText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  fontSize: 15,
})
const $actionHint: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  textAlign: "center",
})
const $skeleton: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $skeletonInvite: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  height: 320,
  borderRadius: spacing.md,
  backgroundColor: colors.palette.neutral300,
  opacity: 0.4,
})
const $skeletonSeat: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  height: 64,
  borderRadius: spacing.sm,
  backgroundColor: colors.palette.neutral300,
  opacity: 0.4,
})
