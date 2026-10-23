import { useEffect, useMemo, useState, type ReactNode } from "react"
import {
  Platform,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type TextStyle,
  type ViewStyle,
} from "react-native"
import { activateKeepAwakeAsync, useKeepAwake } from "expo-keep-awake"
import { useLocalSearchParams } from "expo-router"
import { useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import Head from "expo-router/head"

import { Text } from "@/components/Text"
import { useAuthAccess } from "@/features/auth/AuthContext"
import { translate } from "@/i18n/translate"
import { colors } from "@/theme/colorsDark"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"

import { chunk, clockPhase, fitGrid, formatClock, standingsThroughRound } from "./display"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { clockRemainingMs, type EventClock } from "../../../convex/lib/events/commands"
import { formatDefinition } from "../../../convex/lib/systems"

type EventView = NonNullable<FunctionReturnType<typeof api.events.view>>
type Table = EventView["tables"][number]
type Player = EventView["players"][number]
type Standing = NonNullable<FunctionReturnType<typeof api.events.standings>>[number]
type Styles = ReturnType<typeof displayStyles>

const PAGE_MS = 12_000
const PAIRINGS_SHARE = 0.6

const ink = {
  background: colors.background,
  stripe: colors.palette.neutral200,
  text: colors.text,
  dim: colors.textDim,
  done: colors.success,
  pending: colors.palette.accent100,
  alert: colors.gameMenu.signal.attention,
  open: colors.palette.neutral400,
}

const STATUS_COLOR = { open: ink.open, reported: ink.pending, confirmed: ink.done }

export default function EventDisplayScreen() {
  const { code } = useLocalSearchParams<{ code: string }>()
  const auth = useAuthAccess()
  const insets = useSafeAreaInsetsStyle(["top", "bottom", "left", "right"])
  const s = useDisplayStyles()
  useStoreKeepAwake()
  return (
    <View style={[s.screen, insets]}>
      {auth.configured ? (
        <EventByCode code={code ?? ""} s={s} />
      ) : (
        <Message text={translate("account:cloud.unavailableHeading")} s={s} />
      )}
    </View>
  )
}

const KEEP_AWAKE_TAG = "event-display"

function useStoreKeepAwake() {
  useKeepAwake(KEEP_AWAKE_TAG, { suppressDeactivateWarnings: true })
  useEffect(() => {
    if (Platform.OS !== "web") return
    // why: browsers drop the screen wake lock whenever the tab is hidden, so a TV whose tab was switched away and back would sleep mid-round.
    const relock = () => {
      if (document.visibilityState === "visible")
        void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined)
    }
    document.addEventListener("visibilitychange", relock)
    return () => document.removeEventListener("visibilitychange", relock)
  }, [])
}

function useDisplayStyles() {
  const { width, height } = useWindowDimensions()
  const unit = Math.round(Math.min(32, Math.max(14, Math.min(width / 64, height / 36))))
  return useMemo(() => displayStyles(unit), [unit])
}

function EventByCode({ code, s }: { code: string; s: Styles }) {
  const eventId = useQuery(api.events.byCode, { code })
  if (eventId === undefined) return null
  if (eventId === null) return <Message text={translate("eventDisplay:notFound")} s={s} />
  return <EventBoard key={eventId} eventId={eventId} s={s} />
}

function Message({ text, s }: { text: string; s: Styles }) {
  return (
    <View style={s.message}>
      <Text weight="bold" text={text} accessibilityRole="header" style={s.messageText} />
    </View>
  )
}

function useSize() {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout
    setSize((current) =>
      current?.width === width && current.height === height ? current : { width, height },
    )
  }
  return [size, onLayout] as const
}

function EventBoard({ eventId, s }: { eventId: Id<"events">; s: Styles }) {
  const event = useQuery(api.events.view, { eventId })
  const through = event ? standingsThroughRound(event) : null
  const standings = useQuery(
    api.events.standings,
    through ? { eventId, throughRound: through } : "skip",
  )
  const [shown, setShown] = useState(standings)
  // why: standings refetch when the round's last result lands; keeping the old rows stops the panel blinking out meanwhile.
  if (standings !== undefined && standings !== shown) setShown(standings)
  const [body, onBodyLayout] = useSize()

  if (event === undefined) return null
  if (event === null) return <Message text={translate("eventDisplay:notFound")} s={s} />

  const players = new Map<string, Player>(event.players.map((player) => [player.id, player]))
  const rows = shown ?? []
  const mode = event.status === "active" ? "pairings" : through ? "standings" : "roster"
  const standingsPanel = <StandingsPanel standings={rows} players={players} s={s} />

  let content: ReactNode = null
  if (body && mode === "roster") content = <RosterPanel event={event} s={s} />
  else if (body && mode === "standings") content = standingsPanel
  else if (body) {
    const pairingsWidth = (body.width - s.unit) * PAIRINGS_SHARE
    const split =
      rows.length > 0 &&
      body.width >= 50 * s.unit &&
      fitGrid({
        count: event.tables.length,
        width: pairingsWidth,
        height: body.height - s.panelHeading.height,
        ...pairingsGrid(event, s),
      }).pages === 1
    content = (
      <>
        <PairingsPanel event={event} players={players} s={s} />
        {split ? (
          <View style={[s.side, { width: body.width - s.unit - pairingsWidth }]}>
            {standingsPanel}
          </View>
        ) : null}
      </>
    )
  }

  return (
    <View style={s.board}>
      <Head>
        <title>{event.name}</title>
      </Head>
      <EventHeader event={event} s={s} />
      <View style={s.body} onLayout={onBodyLayout}>
        {content}
      </View>
    </View>
  )
}

function EventHeader({ event, s }: { event: EventView; s: Styles }) {
  const format = formatDefinition(event.system, event.format)?.label ?? event.format
  const stage =
    event.status === "finished"
      ? translate("eventDisplay:final")
      : event.round === 0
        ? null
        : event.round <= event.plannedRounds
          ? translate("eventDisplay:roundOf", { round: event.round, planned: event.plannedRounds })
          : translate("eventDisplay:round", { round: event.round })
  return (
    <View style={s.header}>
      <View style={s.title}>
        <Text
          weight="bold"
          accessibilityRole="header"
          numberOfLines={1}
          text={event.name}
          style={s.name}
        />
        <Text
          weight="medium"
          numberOfLines={1}
          text={[format, stage].filter(Boolean).join(" · ")}
          style={s.meta}
        />
      </View>
      {event.status === "registration" ? (
        <View style={s.codeRow}>
          <Text weight="medium" text={translate("eventDisplay:code")} style={s.codeLabel} />
          <Text weight="bold" text={event.code} selectable style={s.code} />
        </View>
      ) : event.status === "active" && event.clock ? (
        <RoundClock clock={event.clock} s={s} />
      ) : null}
    </View>
  )
}

function useNow(ticking: boolean) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!ticking) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [ticking])
  return now
}

function RoundClock({ clock, s }: { clock: EventClock; s: Styles }) {
  const now = useNow(clock.pausedAt === undefined)
  const remaining = clockRemainingMs(clock, now)
  const phase = clockPhase(clock, remaining)
  const color = {
    color: phase === "time" ? ink.alert : phase === "paused" ? ink.pending : ink.text,
  }
  const label =
    phase === "time"
      ? translate("eventDisplay:time")
      : phase === "paused"
        ? translate("eventDisplay:paused")
        : null
  return (
    <View style={s.clockRow}>
      {label ? <Text weight="bold" text={label} style={[s.clockLabel, color]} /> : null}
      <Text
        weight="bold"
        accessibilityRole="timer"
        text={formatClock(remaining)}
        style={[s.clock, color]}
      />
    </View>
  )
}

function pairingsGrid(event: EventView, s: Styles) {
  return event.structure === "pods"
    ? { rowHeight: s.podRow.height, minColumnWidth: 32 * s.unit }
    : { rowHeight: s.row.height, minColumnWidth: 28 * s.unit }
}

function usePage(pages: number) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (pages <= 1) return
    const timer = setInterval(() => setTick((value) => value + 1), PAGE_MS)
    return () => clearInterval(timer)
  }, [pages])
  return tick % pages
}

function Panel<T>({
  title,
  items,
  s,
  rowHeight = s.row.height,
  minColumnWidth,
  columnHeader,
  keyOf,
  renderRow,
}: {
  title: string
  items: readonly T[]
  s: Styles
  rowHeight?: number
  minColumnWidth: number
  columnHeader?: ReactNode
  keyOf: (item: T) => string
  renderRow: (item: T) => ReactNode
}) {
  const [area, onLayout] = useSize()
  const fit = area
    ? fitGrid({
        count: items.length,
        width: area.width,
        height: area.height - (columnHeader ? s.row.height : 0),
        rowHeight,
        minColumnWidth,
      })
    : null
  const page = usePage(fit?.pages ?? 1)
  const columns = fit ? chunk(chunk(items, fit.rows * fit.columns)[page] ?? [], fit.rows) : []
  return (
    <View style={s.fill}>
      <View style={s.panelHeading}>
        <Text weight="bold" accessibilityRole="header" text={title} style={s.panelTitle} />
        {fit && fit.pages > 1 ? (
          <Text weight="medium" text={`${page + 1}/${fit.pages}`} style={s.pageCount} />
        ) : null}
      </View>
      <View style={s.columns} onLayout={onLayout}>
        {columns.map((column, index) => (
          <View key={index} style={s.fill}>
            {columnHeader ? <View style={s.row}>{columnHeader}</View> : null}
            {column.map((item, row) => (
              <View
                key={keyOf(item)}
                style={[s.row, { height: rowHeight }, row % 2 === 1 && s.stripe]}
              >
                {renderRow(item)}
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  )
}

function PairingsPanel({
  event,
  players,
  s,
}: {
  event: EventView
  players: ReadonlyMap<string, Player>
  s: Styles
}) {
  const pods = event.structure === "pods"
  const renderRow = (table: Table) => {
    const bye = table.result?.kind === "bye"
    const names = table.playerIds.map((id) => players.get(id)?.name ?? "")
    return (
      <>
        <Text weight="bold" text={String(table.table)} style={[s.cell, s.tableNumber]} />
        {pods ? (
          <Text numberOfLines={2} text={names.join(" · ")} style={[s.cell, s.fill]} />
        ) : (
          <>
            <Text numberOfLines={1} text={names[0]} style={[s.cell, s.fill]} />
            <Text
              numberOfLines={1}
              weight={bye ? "bold" : undefined}
              text={bye ? translate("eventDisplay:bye") : names[1]}
              style={[s.cell, s.fill, bye && s.bye]}
            />
          </>
        )}
        <View
          accessible
          accessibilityLabel={translate(`eventDisplay:tableStatus.${table.status}`)}
          style={[s.status, { backgroundColor: STATUS_COLOR[table.status] }]}
        />
      </>
    )
  }
  return (
    <Panel
      title={translate("eventDisplay:pairings")}
      items={event.tables}
      s={s}
      {...pairingsGrid(event, s)}
      keyOf={(table) => table.id}
      renderRow={renderRow}
    />
  )
}

function StandingsPanel({
  standings,
  players,
  s,
}: {
  standings: readonly Standing[]
  players: ReadonlyMap<string, Player>
  s: Styles
}) {
  const header = (
    <>
      <View style={s.rank} />
      <View style={s.fill} />
      <Text text={translate("eventDisplay:points")} style={[s.columnLabel, s.points]} />
      <Text text={translate("eventDisplay:record")} style={[s.columnLabel, s.record]} />
    </>
  )
  return (
    <Panel
      title={translate("eventDisplay:standings")}
      items={standings}
      s={s}
      minColumnWidth={22 * s.unit}
      columnHeader={header}
      keyOf={(standing) => standing.playerId}
      renderRow={(standing) => {
        const dropped = players.get(standing.playerId)?.dropped && s.dim
        return (
          <>
            <Text weight="bold" text={String(standing.rank)} style={[s.cell, s.rank, dropped]} />
            <Text
              numberOfLines={1}
              text={players.get(standing.playerId)?.name ?? ""}
              style={[s.cell, s.fill, dropped]}
            />
            <Text
              weight="bold"
              text={String(standing.points)}
              style={[s.cell, s.points, dropped]}
            />
            <Text
              text={`${standing.wins}-${standing.losses}-${standing.draws}`}
              style={[s.cell, s.record, dropped]}
            />
          </>
        )
      }}
    />
  )
}

function RosterPanel({ event, s }: { event: EventView; s: Styles }) {
  const players = useMemo(
    () => [...event.players].sort((a, b) => a.name.localeCompare(b.name)),
    [event.players],
  )
  if (players.length === 0) return <Message text={translate("eventDisplay:noPlayers")} s={s} />
  return (
    <Panel
      title={translate("eventDisplay:players", { count: players.length })}
      items={players}
      s={s}
      minColumnWidth={16 * s.unit}
      keyOf={(player) => player.id}
      renderRow={(player) => <Text numberOfLines={1} text={player.name} style={[s.cell, s.fill]} />}
    />
  )
}

function displayStyles(u: number) {
  const number: TextStyle = { textAlign: "right", fontVariant: ["tabular-nums"] }
  return {
    unit: u,
    screen: { flex: 1, backgroundColor: ink.background },
    fill: { flex: 1 },
    message: { flex: 1, alignItems: "center", justifyContent: "center", padding: u },
    messageText: { color: ink.text, fontSize: 1.6 * u, lineHeight: 2 * u, textAlign: "center" },
    board: { flex: 1, paddingHorizontal: u, paddingBottom: u / 2 },
    body: { flex: 1, flexDirection: "row" },
    side: { marginLeft: u },
    header: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      columnGap: 2 * u,
      paddingVertical: u / 2,
    },
    title: { flex: 1, minWidth: 16 * u },
    name: { color: ink.text, fontSize: 1.8 * u, lineHeight: 2.3 * u },
    meta: { color: ink.text, fontSize: 1.1 * u, lineHeight: 1.5 * u },
    codeRow: { flexDirection: "row", alignItems: "baseline", columnGap: u },
    codeLabel: { color: ink.dim, fontSize: 1.1 * u, lineHeight: 1.5 * u },
    code: { color: ink.text, fontSize: 3 * u, lineHeight: 3.6 * u, letterSpacing: u / 6 },
    clockRow: { flexDirection: "row", alignItems: "center", columnGap: u },
    clockLabel: { fontSize: 1.6 * u, lineHeight: 2 * u, textTransform: "uppercase" },
    clock: { fontSize: 3.6 * u, lineHeight: 4.2 * u, fontVariant: ["tabular-nums"] },
    panelHeading: {
      height: 2 * u,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    panelTitle: { color: ink.text, fontSize: 1.2 * u, lineHeight: 1.6 * u },
    pageCount: { color: ink.dim, fontSize: u, lineHeight: 1.4 * u, ...number },
    columns: { flex: 1, flexDirection: "row", columnGap: u },
    row: {
      height: 1.7 * u,
      flexDirection: "row",
      alignItems: "center",
      columnGap: u / 2,
      paddingHorizontal: u / 3,
    },
    podRow: { height: 3 * u },
    stripe: { backgroundColor: ink.stripe },
    cell: { color: ink.text, fontSize: u, lineHeight: 1.3 * u },
    dim: { color: ink.dim },
    bye: { color: ink.pending },
    tableNumber: { width: 2.5 * u, ...number },
    status: { width: 0.6 * u, height: 0.6 * u, borderRadius: 0.3 * u, marginHorizontal: u / 5 },
    columnLabel: { color: ink.dim, fontSize: 0.8 * u, lineHeight: 1.1 * u },
    rank: { width: 2.5 * u, ...number },
    points: { width: 3 * u, ...number },
    record: { width: 5 * u, ...number },
  } satisfies Record<string, number | ViewStyle | TextStyle>
}
