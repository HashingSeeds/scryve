import { useState } from "react"
import type { TextStyle } from "react-native"
import { TouchableOpacity, View } from "react-native"

import { AlertNote } from "@/components/AlertNote"
import { Button, PlusAccessory } from "@/components/Button"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { DeckActionsSheet, type DeckAction } from "@/components/DeckActionsSheet"
import { EmptyState } from "@/components/EmptyState"
import { HeaderIcon } from "@/components/Header"
import { SectionHeader, TrailingNumber } from "@/components/NumberLane"
import { Tabs } from "@/components/Tabs"
import { Text } from "@/components/Text"
import { TextAction } from "@/components/TextAction"
import { TextField } from "@/components/TextField"
import { useSheetPresence } from "@/components/useSheetPresence"
import { ValueField } from "@/components/ValueField"
import type { CloudAccess } from "@/features/auth/CloudScreen"
import { readPublicCloudConfig } from "@/features/auth/config"
import { InviteCard } from "@/features/connected/InviteCard"
import { eventDisplayUrl } from "@/features/eventDisplay/display"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { EventClockRow } from "./EventClockRow"
import { $action, $actions, $grow, $row, $section, EventFrame } from "./EventFrame"
import {
  canConfirm,
  canReport,
  confirmingOpponents,
  eventErrorText,
  eventMeta,
  eventStatusText,
  firstTiebreaker,
  isFinalRound,
  myResultText,
  myTable,
  percent,
  playerName,
  resultText,
  tablePlayers,
} from "./eventLogic"
import type { EventSource, EventTableView, EventView } from "./eventSource"
import { ResultDialog } from "./ResultDialog"
import {
  MAX_ROUND_MINUTES,
  MIN_ROUND_MINUTES,
  standingsThroughRound,
  startRoundBlocker,
  type RoundBlocker,
} from "../../../convex/lib/events/commands"
import { MAX_EVENT_ROUNDS } from "../../../convex/lib/events/model"
import { suggestedSwissRounds } from "../../../convex/lib/events/pairing"

const TABS = ["round", "players", "standings"] as const
type Tab = (typeof TABS)[number]
type Confirming = "finish" | "remove" | "drop" | "replaceGame"

function useCommand() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  async function run(command: () => Promise<void>) {
    setBusy(true)
    setError(undefined)
    try {
      await command()
      return true
    } catch (cause) {
      setError(eventErrorText(cause))
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, setError, run }
}

function blockerText(blocker: RoundBlocker) {
  switch (blocker.kind) {
    case "players":
      return translate("events:blocked.players", { count: blocker.count })
    case "results":
      return translate("events:blocked.results")
    case "maxRounds":
      return translate("events:blocked.maxRounds")
    case "finished":
      return translate("events:status.finished")
  }
}

export function EventScreen({
  access,
  source,
  onBack,
  onRemoved,
  onStartMatch,
  notice,
  showStoreScreen = true,
}: {
  access?: CloudAccess
  source: EventSource
  onBack: () => void
  onRemoved: () => void
  onStartMatch?: (view: EventView, table: EventTableView, replace: boolean) => boolean
  notice?: string
  showStoreScreen?: boolean
}) {
  const { view } = source
  const command = useCommand()
  const [chosenTab, setTab] = useState<Tab>()
  const [editing, setEditing] = useState<string>()
  const resultSheet = useSheetPresence(editing)
  const [dialog, setDialog] = useState<"actions" | Confirming>()
  const dialogs = useSheetPresence(dialog, (shown) => shown === "actions")
  const confirming = dialogs.shown === "actions" ? undefined : dialogs.shown
  const [matchTable, setMatchTable] = useState<EventTableView>()
  // why: during registration the organizer's work (the join code, guests) is on Players.
  const tab =
    chosenTab ?? (view?.isOrganizer && view.status === "registration" ? "players" : "round")

  if (view === null)
    return (
      <EventFrame title={translate("events:title")} access={access} onBack={onBack}>
        <EmptyState
          imageSource={null}
          heading={translate("events:notFound")}
          buttonTx="common:back"
          buttonOnPress={onBack}
        />
      </EventFrame>
    )

  const finalRound = view ? isFinalRound(view) : false
  const nextRound = view ? startRoundBlocker(view) : undefined
  // why: finishing only needs every result in; a capped round count or a dropped field must not trap the organizer.
  const blocker = finalRound && nextRound?.kind !== "results" ? undefined : nextRound
  const editingTable = view?.tables.find((table) => table.id === resultSheet.shown)
  const organizerFooter =
    view?.isOrganizer && view.status !== "finished" ? (
      <>
        {blocker ? <Text size="xs" tone="dim" text={blockerText(blocker)} /> : null}
        {finalRound ? (
          <Button
            testID="finish-event-footer-button"
            preset="primary"
            disabled={command.busy || blocker !== undefined}
            tx="events:finish.action"
            onPress={() => setDialog("finish")}
          />
        ) : (
          <Button
            testID="start-round-button"
            preset="primary"
            disabled={command.busy || blocker !== undefined}
            tx="events:startRound"
            txOptions={{ round: view.round + 1 }}
            onPress={async () => {
              if (await command.run(source.startNextRound)) setTab("round")
            }}
          />
        )}
      </>
    ) : undefined
  const me = view?.players.find((player) => player.id === view.myPlayerId)
  const actions: DeckAction[] = (
    [
      ["finish", view?.isOrganizer && view.status === "active" && !finalRound],
      ["remove", view?.isOrganizer && view.round === 0],
      ["drop", me && !me.dropped && view?.status !== "finished"],
    ] as const
  )
    .filter(([, shown]) => shown)
    .map(([id]) => ({
      id,
      label: translate(`events:${id}.action`),
      destructive: id !== "finish",
      onPress: () => setDialog(id),
    }))

  async function confirmAction() {
    if (!view || !confirming) return
    if (confirming === "replaceGame") {
      setDialog(undefined)
      if (matchTable) onStartMatch?.(view, matchTable, true)
      return
    }
    const done = await command.run(async () => {
      if (confirming === "finish") await source.finish()
      else if (confirming === "remove") await source.remove()
      else if (view.myPlayerId) await source.dropPlayer(view.myPlayerId)
    })
    setDialog(undefined)
    if (done && confirming === "remove") onRemoved()
  }

  return (
    <EventFrame
      title={view?.name ?? translate("events:title")}
      access={access}
      loading={view === undefined}
      onBack={onBack}
      footer={organizerFooter}
      headerAction={
        actions.length > 0 ? (
          <HeaderIcon
            testID="event-actions-button"
            icon="more"
            label={translate("events:actions")}
            onPress={() => setDialog("actions")}
          />
        ) : undefined
      }
    >
      {view ? (
        <>
          <Text
            size="meta"
            tone="dim"
            text={[
              eventMeta(view),
              view.status === "active"
                ? translate("events:roundOf", { round: view.round, planned: view.plannedRounds })
                : eventStatusText(view),
            ].join(" · ")}
          />
          {view.status === "active" && view.clock ? (
            <EventClockRow
              clock={view.clock}
              busy={command.busy}
              onAction={
                view.isOrganizer
                  ? (action) => void command.run(() => source.adjustClock(action))
                  : undefined
              }
            />
          ) : null}
          <Tabs
            testID="event-tabs"
            accessibilityLabel={view.name}
            tabs={TABS.map((id) => ({
              id,
              label: translate(`events:tabs.${id}`),
              count: id === "players" ? view.players.length : undefined,
            }))}
            selectedId={tab}
            onSelect={setTab}
          />
          {notice ? <AlertNote testID="event-notice" text={notice} /> : null}
          {command.error ? <AlertNote testID="event-error" text={command.error} /> : null}
          {tab === "round" ? (
            <RoundTab
              view={view}
              busy={command.busy}
              onEdit={setEditing}
              onConfirm={(table) => void command.run(() => source.confirm(table.id))}
              onStartMatch={
                onStartMatch &&
                ((table) => {
                  if (onStartMatch(view, table, false)) return
                  setMatchTable(table)
                  setDialog("replaceGame")
                })
              }
            />
          ) : tab === "players" ? (
            <PlayersTab
              view={view}
              source={source}
              busy={command.busy}
              run={command.run}
              showStoreScreen={showStoreScreen}
            />
          ) : (
            <StandingsTab view={view} source={source} />
          )}
          {editingTable ? (
            <ResultDialog
              view={view}
              table={editingTable}
              busy={command.busy}
              visible={resultSheet.visible}
              onClose={() => setEditing(undefined)}
              onDismissed={resultSheet.onDismissed}
              onSave={async (result) => {
                if (await command.run(() => source.report(editingTable.id, result)))
                  setEditing(undefined)
              }}
            />
          ) : null}
          {dialogs.shown === "actions" ? (
            <DeckActionsSheet
              visible={dialogs.visible}
              actions={actions}
              onClose={() => setDialog(undefined)}
              onDismissed={dialogs.onDismissed}
            />
          ) : null}
          <ConfirmDialog
            visible={confirming !== undefined}
            title={translate(`events:${confirming ?? "finish"}.title`)}
            message={translate(`events:${confirming ?? "finish"}.message`)}
            confirmText={translate(`events:${confirming ?? "finish"}.confirm`)}
            destructive={confirming !== "finish" && confirming !== "replaceGame"}
            busy={command.busy}
            confirmTestID="event-confirm-button"
            backdropAccessibilityLabel={translate("common:cancel")}
            onConfirm={() => void confirmAction()}
            onClose={() => setDialog(undefined)}
          />
        </>
      ) : null}
    </EventFrame>
  )
}

function RoundTab({
  view,
  busy,
  onEdit,
  onConfirm,
  onStartMatch,
}: {
  view: EventView
  busy: boolean
  onEdit: (tableId: string) => void
  onConfirm: (table: EventTableView) => void
  onStartMatch?: (table: EventTableView) => void
}) {
  const { themed } = useAppTheme()
  const mine = myTable(view)
  const me = view.players.find((player) => player.id === view.myPlayerId)
  return (
    <>
      {me ? (
        <View testID="my-table" style={themed($section)}>
          <SectionHeader label={translate("events:myTable")} />
          {mine ? (
            <MyTable
              view={view}
              table={mine}
              busy={busy}
              onEdit={onEdit}
              onConfirm={onConfirm}
              onStartMatch={onStartMatch}
            />
          ) : (
            <Text
              tone="dim"
              tx={
                view.status === "registration"
                  ? "events:waitingToStart"
                  : me.dropped
                    ? "events:dropped"
                    : "events:noTable"
              }
            />
          )}
        </View>
      ) : view.status === "registration" ? (
        <Text tone="dim" tx="events:waitingToStart" />
      ) : null}
      {view.isOrganizer && view.tables.length > 0 ? (
        <View testID="tables" style={themed($section)}>
          <SectionHeader
            label={translate("events:tables")}
            count={`${view.tables.filter((table) => table.result !== null).length}/${view.tables.length}`}
          />
          {view.tables.map((table) => (
            <TableRow
              key={table.id}
              view={view}
              table={table}
              onPress={canReport(view, table) ? () => onEdit(table.id) : undefined}
            />
          ))}
        </View>
      ) : null}
    </>
  )
}

function MyTable({
  view,
  table,
  busy,
  onEdit,
  onConfirm,
  onStartMatch,
}: {
  view: EventView
  table: EventTableView
  busy: boolean
  onEdit: (tableId: string) => void
  onConfirm: (table: EventTableView) => void
  onStartMatch?: (table: EventTableView) => void
}) {
  const { themed } = useAppTheme()
  const bye = table.result?.kind === "bye"
  const opponents = table.playerIds.filter((id) => id !== view.myPlayerId)
  const reportedByMe = table.status === "reported" && table.reportedBy === view.myPlayerId
  const confirmers = confirmingOpponents(view, table)
  return (
    <>
      <Text
        preset="heading"
        testID="my-table-number"
        tx="events:table"
        txOptions={{ table: table.table }}
      />
      <Text
        weight="medium"
        text={
          bye ? translate("events:bye") : opponents.map((id) => playerName(view, id)).join(", ")
        }
      />
      {bye ? null : <Text size="xs" testID="my-table-result" text={myResultText(view, table)} />}
      {reportedByMe && !view.isOrganizer && confirmers > 0 ? (
        <Text
          size="xs"
          tone="dim"
          tx="events:waitingForConfirm"
          txOptions={{ count: confirmers }}
        />
      ) : null}
      <View style={themed($actions)}>
        {onStartMatch && !bye && view.status === "active" && table.result === null ? (
          <Button
            testID="start-match-button"
            tx="events:startMatch"
            style={$action}
            onPress={() => onStartMatch(table)}
          />
        ) : null}
        {canReport(view, table) ? (
          <Button
            testID="report-button"
            tx={table.result ? "events:changeReport" : "events:report"}
            disabled={busy}
            style={$action}
            onPress={() => onEdit(table.id)}
          />
        ) : null}
      </View>
      {canConfirm(view, table) && !reportedByMe ? (
        <Button
          testID="confirm-button"
          preset={view.isOrganizer ? undefined : "primary"}
          disabled={busy}
          tx="events:confirm"
          onPress={() => onConfirm(table)}
        />
      ) : null}
    </>
  )
}

function TableRow({
  view,
  table,
  onPress,
}: {
  view: EventView
  table: EventTableView
  onPress?: () => void
}) {
  const { themed } = useAppTheme()
  return (
    <TouchableOpacity
      testID={`table-${table.table}`}
      accessibilityRole="button"
      disabled={!onPress}
      activeOpacity={0.75}
      style={themed($row)}
      onPress={onPress}
    >
      <Text size="xs" weight="bold" style={themed($tableNumber)} text={String(table.table)} />
      <Text style={$grow} numberOfLines={2} text={tablePlayers(view, table)} />
      <Text
        size="xs"
        tone={table.status === "open" ? "dim" : undefined}
        text={
          table.result
            ? `${resultText(view, table)}${table.status === "reported" ? ` · ${translate("events:tableStatus.reported")}` : ""}`
            : translate("events:tableStatus.open")
        }
      />
    </TouchableOpacity>
  )
}

function PlayersTab({
  view,
  source,
  busy,
  run,
  showStoreScreen,
}: {
  view: EventView
  source: EventSource
  busy: boolean
  run: (command: () => Promise<void>) => Promise<boolean>
  showStoreScreen: boolean
}) {
  const { themed } = useAppTheme()
  const [guest, setGuest] = useState("")
  async function addGuest() {
    const name = guest.trim()
    if (busy || !name) return
    if (await run(() => source.addGuest(name))) setGuest("")
  }
  const [rounds, setRounds] = useState<number>()
  const [minutes, setMinutes] = useState<number>()
  const managing = view.isOrganizer && view.status !== "finished"
  const active = view.players.filter((player) => !player.dropped).length
  const cloud = readPublicCloudConfig()
  const displayUrl =
    showStoreScreen && cloud.configured
      ? eventDisplayUrl(cloud.value.inviteOrigin, view.code)
      : null
  return (
    <>
      {managing ? (
        <>
          <InviteCard qrPayload={view.code} manualCode={view.code} />
          {displayUrl ? (
            <View style={themed($section)}>
              <Text preset="formLabel" tx="events:storeScreen" />
              <Text testID="store-screen-url" selectable text={displayUrl} />
            </View>
          ) : null}
          <View style={themed($section)}>
            <TextField
              testID="guest-name-input"
              labelTx="events:guestName"
              value={guest}
              maxLength={24}
              returnKeyType="done"
              submitBehavior="submit"
              onChangeText={setGuest}
              onSubmitEditing={() => void addGuest()}
            />
            <Button
              testID="add-guest-button"
              tx="events:addGuest"
              LeftAccessory={PlusAccessory}
              disabled={busy || !guest.trim()}
              onPress={() => void addGuest()}
            />
          </View>
          <View style={themed($section)}>
            <ValueField
              testID="planned-rounds"
              label={translate("events:settings.rounds")}
              value={rounds ?? view.plannedRounds}
              min={Math.max(1, view.round)}
              max={MAX_EVENT_ROUNDS}
              onChange={async (plannedRounds) => {
                setRounds(plannedRounds)
                if (!(await run(() => source.update({ plannedRounds })))) setRounds(undefined)
              }}
            />
            {view.structure === "swiss" && active >= 2 ? (
              <Text
                size="xs"
                text={translate("events:settings.suggested", {
                  count: active,
                  rounds: suggestedSwissRounds(active),
                })}
              />
            ) : null}
            <ValueField
              testID="round-minutes"
              label={translate("events:settings.roundMinutes")}
              value={minutes ?? view.roundMinutes}
              min={MIN_ROUND_MINUTES}
              max={MAX_ROUND_MINUTES}
              step={5}
              onChange={async (roundMinutes) => {
                setMinutes(roundMinutes)
                if (!(await run(() => source.update({ roundMinutes })))) setMinutes(undefined)
              }}
            />
          </View>
        </>
      ) : null}
      <View style={themed($section)}>
        <SectionHeader label={translate("events:tabs.players")} count={active} />
        {view.players.map((player) => (
          <View key={player.id} testID={`player-${player.id}`} style={themed($row)}>
            <Text style={$grow} numberOfLines={1} text={player.name} />
            {player.guest || player.dropped ? (
              <Text
                size="xs"
                tone="dim"
                text={[
                  ...(player.guest ? [translate("events:guest")] : []),
                  ...(player.dropped ? [translate("events:dropped")] : []),
                ].join(" · ")}
              />
            ) : null}
            {managing ? (
              <TextAction
                testID={`${player.dropped ? "undrop" : "drop"}-${player.id}`}
                tx={player.dropped ? "events:undrop" : "events:drop.action"}
                disabled={busy}
                onPress={() =>
                  void run(() =>
                    player.dropped ? source.undropPlayer(player.id) : source.dropPlayer(player.id),
                  )
                }
              />
            ) : null}
          </View>
        ))}
      </View>
    </>
  )
}

function StandingsTab({ view, source }: { view: EventView; source: EventSource }) {
  const { themed } = useAppTheme()
  const tiebreaker = firstTiebreaker(view.system)
  const rows = source.standings
  if (!rows || rows.length === 0 || standingsThroughRound(view) === 0)
    return <Text tone="dim" tx="events:standings.empty" />
  return (
    <View testID="standings">
      <View style={themed($row)}>
        <Text preset="sectionLabel" style={$rank} tx="events:standings.rank" />
        <Text preset="sectionLabel" style={$grow} tx="events:standings.player" />
        <TrailingNumber preset="sectionLabel" value={translate("events:standings.points")} />
        <TrailingNumber preset="sectionLabel" value={translate("events:standings.record")} />
        {tiebreaker ? (
          <TrailingNumber
            preset="sectionLabel"
            value={translate(`events:tiebreaker.${tiebreaker}`)}
          />
        ) : null}
      </View>
      {rows.map((row) => (
        <View key={row.playerId} testID={`standing-${row.playerId}`} style={themed($row)}>
          <Text size="xs" style={$rank} text={String(row.rank)} />
          <Text size="xs" style={$grow} numberOfLines={1} text={playerName(view, row.playerId)} />
          <TrailingNumber size="xs" weight="bold" value={row.points} />
          <TrailingNumber size="xs" value={`${row.wins}-${row.losses}-${row.draws}`} />
          {tiebreaker ? (
            <TrailingNumber size="xs" value={percent(row.tiebreakers[0] ?? 0)} />
          ) : null}
        </View>
      ))}
    </View>
  )
}

const $tableNumber: ThemedStyle<TextStyle> = () => ({ width: 28 })
const $rank: TextStyle = { width: 28, fontVariant: ["tabular-nums"] }
