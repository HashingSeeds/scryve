import { useMemo, useState } from "react"
import {
  Platform,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type TextStyle,
  type ViewStyle,
} from "react-native"
import { useLocalSearchParams } from "expo-router"
import { useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import Head from "expo-router/head"

import { PlayerMark } from "@/components/PlayerMark"
import { Text } from "@/components/Text"
import { useNow } from "@/components/TurnChip"
import { useAuthAccess } from "@/features/auth/AuthContext"
import { treacheryRoleLabel } from "@/features/connected/TreacheryRoleDialog"
import { useStoreKeepAwake } from "@/features/eventDisplay/EventDisplayScreen"
import { matchContextLabel } from "@/features/game/domain"
import { formatName, tableItemShortLabel } from "@/features/game/playSystems"
import { joinParts } from "@/i18n/format"
import { translate } from "@/i18n/translate"
import { colors } from "@/theme/colorsDark"
import { accessibleForeground } from "@/utils/colorContrast"
import { goBack } from "@/utils/navigation"
import { formatElapsed } from "@/utils/useElapsedSince"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"

import { api } from "../../../convex/_generated/api"
import { tableRules } from "../../../convex/lib/systems"
import { holdsDesignation, type TableState } from "../../../convex/lib/table"
import { bankLeft, clockOwner, turnLead } from "../../../convex/lib/turns"

type Board = NonNullable<FunctionReturnType<typeof api.games.watchBoard>>
type LiveBoard = Extract<Board, { players: unknown }>
type Seat = LiveBoard["players"][number]
type Styles = ReturnType<typeof watchStyles>

const TILE_ASPECT = 1.5

export default function WatchScreen() {
  const { code } = useLocalSearchParams<{ code: string }>()
  const auth = useAuthAccess()
  const insets = useSafeAreaInsetsStyle(["top", "bottom", "left", "right"])
  const s = useWatchStyles()
  useStoreKeepAwake()
  return (
    <View style={[s.screen, insets]}>
      {/* why: a Watch link can cold-launch the app straight onto this screen, which then has nothing to go back to. */}
      {Platform.OS === "web" ? null : (
        <Text
          weight="bold"
          accessibilityRole="button"
          tx="common:close"
          onPress={() => goBack("/")}
          style={s.close}
        />
      )}
      {auth.configured ? (
        <WatchBoard code={code ?? ""} s={s} />
      ) : (
        <Message text={translate("account:cloud.unavailableHeading")} s={s} />
      )}
    </View>
  )
}

function useWatchStyles() {
  const { width, height } = useWindowDimensions()
  const unit = Math.round(Math.min(32, Math.max(12, Math.min(width / 64, height / 36))))
  return useMemo(() => watchStyles(unit), [unit])
}

function Message({ text, s }: { text: string; s: Styles }) {
  return (
    <View style={s.message}>
      <Text weight="bold" text={text} accessibilityRole="header" style={s.messageText} />
    </View>
  )
}

function WatchBoard({ code, s }: { code: string; s: Styles }) {
  const board = useQuery(api.games.watchBoard, { code })
  if (board === undefined) return null
  if (board === null) return <Message text={translate("connected:watch.notFound")} s={s} />
  if (!("players" in board)) return <Message text={translate("connected:watch.ended")} s={s} />
  return <LiveWatchBoard board={board} s={s} />
}

function LiveWatchBoard({ board, s }: { board: LiveBoard; s: Styles }) {
  const [area, setArea] = useState<{ width: number; height: number }>()
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout
    setArea((current) =>
      current?.width === width && current.height === height ? current : { width, height },
    )
  }
  const seats = board.players
  const seatsById = new Map<string, Seat>(seats.map((seat) => [seat.playerId, seat]))
  const turn = board.turn
  const turnSeat = turn ? seatsById.get(turn.playerId) : undefined
  const turnTeam = turn ? turnLead(board.turnGroups, turn.playerId) : undefined
  const rules = tableRules(board.system, board.format)
  const table: TableState = {
    designations: board.designations ?? {},
    players: Object.fromEntries(
      seats.map((seat) => [seat.playerId, { counters: seat.counters ?? {} }]),
    ),
  }
  const match = board.match
  const scored = match && "seats" in match ? match.seats : []
  const matchLine =
    match?.bestOf &&
    translate("board:match.statusLine", {
      context:
        matchContextLabel({
          match: {
            gameNumber: match.gameNumber,
            wins: seats.map(
              (seat) => scored.find((entry) => entry.seat === seat.seat)?.gamesWon ?? 0,
            ),
            draws: scored[0]?.gamesDrawn ?? 0,
          },
        }) ?? "",
      bestOf: match.bestOf,
    })
  const stage =
    board.status === "lobby"
      ? translate("connected:watch.waiting")
      : board.status === "finished"
        ? translate("connected:watch.final")
        : undefined
  const columns = area ? gridColumns(seats.length, area.width, area.height) : 1
  const rows = Math.ceil(seats.length / columns)
  const title = formatName(board.system, board.format)

  return (
    <View style={s.board}>
      <Head>
        <title>{title}</title>
      </Head>
      <View style={s.header}>
        <Text
          weight="bold"
          accessibilityRole="header"
          numberOfLines={1}
          text={joinParts([title, matchLine, stage])}
          style={s.title}
        />
        {turn && turnSeat ? (
          <Text
            weight="bold"
            numberOfLines={1}
            text={translate("board:turn.label", { number: turn.number, name: turnSeat.name })}
            style={s.turn}
          />
        ) : null}
      </View>
      <View style={s.grid} onLayout={onLayout}>
        {area
          ? seats.map((seat) => (
              <SeatTile
                key={seat.playerId}
                seat={seat}
                board={board}
                seatsById={seatsById}
                labels={[
                  ...rules.designations
                    .filter((designation) => holdsDesignation(table, designation, seat.playerId))
                    .map(tableItemShortLabel),
                  ...(seat.role ? [treacheryRoleLabel(seat.role)] : []),
                ]}
                counters={[
                  ...rules.counters.flatMap((counter) => {
                    const value = seat.counters?.[counter.id] ?? 0
                    return value ? [counterText(tableItemShortLabel(counter), value)] : []
                  }),
                  ...(seat.customCounters ?? []).flatMap(({ name, value }) =>
                    value ? [counterText(name, value)] : [],
                  ),
                ]}
                turnHolder={
                  turn !== undefined && turnLead(board.turnGroups, seat.playerId) === turnTeam
                }
                size={{ width: area.width / columns, height: area.height / rows }}
                s={s}
              />
            ))
          : null}
      </View>
    </View>
  )
}

const counterText = (name: string, value: number) =>
  translate("connected:watch.counter", { name, value })

export function gridColumns(count: number, width: number, height: number) {
  let best = { columns: 1, size: 0 }
  for (let columns = 1; columns <= count; columns++) {
    const rows = Math.ceil(count / columns)
    const tileWidth = width / columns
    const tileHeight = height / rows
    const size = Math.min(tileWidth, tileHeight * TILE_ASPECT)
    if (size > best.size) best = { columns, size }
  }
  return best.columns
}

function SeatTile({
  seat,
  board,
  seatsById,
  labels,
  counters,
  turnHolder,
  size,
  s,
}: {
  seat: Seat
  board: LiveBoard
  seatsById: ReadonlyMap<string, Seat>
  labels: readonly string[]
  counters: readonly string[]
  turnHolder: boolean
  size: { width: number; height: number }
  s: Styles
}) {
  const ink = accessibleForeground(seat.color)
  const lifeSize = Math.max(s.unit * 2, Math.min(size.height * 0.5, size.width * 0.3))
  const damage = (board.commanderDamage ?? []).filter(
    ({ toPlayerId }) => toPlayerId === seat.playerId,
  )
  return (
    <View style={[s.cell, size]}>
      <View
        style={[
          s.tile,
          { backgroundColor: seat.color },
          turnHolder && { borderColor: colors.text },
          seat.out && s.out,
        ]}
      >
        <View style={s.tileTop}>
          <Text weight="bold" numberOfLines={1} text={seat.name} style={[s.name, { color: ink }]} />
          {board.turn?.bank && turnLead(board.turnGroups, seat.playerId) === seat.playerId ? (
            <BankClock turn={board.turn} playerId={seat.playerId} ink={ink} s={s} />
          ) : null}
        </View>
        {labels.length > 0 || seat.out ? (
          <Text
            weight="medium"
            numberOfLines={1}
            text={joinParts([seat.out ? translate("connected:watch.out") : undefined, ...labels])}
            style={[s.detail, { color: ink }]}
          />
        ) : null}
        <View style={s.lifeArea}>
          <Text
            weight="bold"
            numberOfLines={1}
            adjustsFontSizeToFit
            text={seat.life}
            style={[s.life, { color: ink, fontSize: lifeSize, lineHeight: lifeSize * 1.1 }]}
          />
        </View>
        {counters.length > 0 ? (
          <Text
            weight="medium"
            numberOfLines={1}
            text={joinParts(counters)}
            style={[s.detail, { color: ink }]}
          />
        ) : null}
        {damage.length > 0 ? (
          <View style={s.damageRow}>
            {damage.map((row) => {
              const from = seatsById.get(row.fromPlayerId)
              if (!from) return null
              const chipInk = accessibleForeground(from.color)
              return (
                <View
                  key={`${row.fromPlayerId}:${row.commander ?? 0}`}
                  accessible
                  accessibilityRole="image"
                  accessibilityLabel={translate(
                    row.commander === 1
                      ? "connected:watch.partnerDamage"
                      : "connected:watch.commanderDamage",
                    { total: row.total, name: from.name },
                  )}
                  style={[s.damage, { backgroundColor: from.color, borderColor: ink }]}
                >
                  <PlayerMark
                    seatNumber={from.seat}
                    color={chipInk}
                    shape={from.shape}
                    insetGlyph="none"
                    size={Math.round(s.unit * 1.2)}
                  />
                  {row.commander === 1 ? (
                    <Text
                      weight="medium"
                      tx="board:commander.unnamedPartner"
                      style={[s.detail, { color: chipInk }]}
                    />
                  ) : null}
                  <Text
                    weight="bold"
                    text={row.total}
                    style={[s.damageTotal, { color: chipInk }]}
                  />
                </View>
              )
            })}
          </View>
        ) : null}
      </View>
    </View>
  )
}

function BankClock({
  turn,
  playerId,
  ink,
  s,
}: {
  turn: NonNullable<LiveBoard["turn"]>
  playerId: string
  ink: string
  s: Styles
}) {
  const now = useNow(clockOwner(turn) === playerId && !turn.paused && !turn.waiting)
  const left = bankLeft(turn, playerId, now) ?? 0
  return (
    <Text
      weight="bold"
      accessibilityRole="timer"
      text={left > 0 ? formatElapsed(left) : translate("board:turn.outOfTime")}
      style={[s.clock, { color: ink }]}
    />
  )
}

function watchStyles(u: number) {
  return {
    unit: u,
    screen: { flex: 1, backgroundColor: colors.background },
    message: { flex: 1, alignItems: "center", justifyContent: "center", padding: u },
    messageText: {
      color: colors.text,
      fontSize: 1.6 * u,
      lineHeight: 2 * u,
      textAlign: "center",
    },
    close: { color: colors.text, fontSize: u, lineHeight: 1.4 * u, padding: u / 2 },
    board: { flex: 1, paddingHorizontal: u / 2, paddingBottom: u / 2 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      columnGap: 2 * u,
      paddingHorizontal: u / 2,
      paddingVertical: u / 2,
    },
    title: { flex: 1, color: colors.text, fontSize: 1.3 * u, lineHeight: 1.7 * u },
    turn: { color: colors.text, fontSize: 1.3 * u, lineHeight: 1.7 * u },
    grid: { flex: 1, flexDirection: "row", flexWrap: "wrap" },
    cell: { padding: u / 4 },
    tile: {
      flex: 1,
      borderRadius: u / 2,
      borderWidth: u / 5,
      borderColor: "transparent",
      paddingHorizontal: u * 0.75,
      paddingVertical: u / 2,
      overflow: "hidden",
    },
    out: { opacity: 0.35 },
    tileTop: { flexDirection: "row", alignItems: "center", columnGap: u },
    name: { flex: 1, fontSize: 1.4 * u, lineHeight: 1.8 * u },
    clock: { fontSize: 1.4 * u, lineHeight: 1.8 * u, fontVariant: ["tabular-nums"] },
    detail: { fontSize: u, lineHeight: 1.3 * u },
    lifeArea: { flex: 1, alignItems: "center", justifyContent: "center" },
    life: { textAlign: "center", fontVariant: ["tabular-nums"] },
    damageRow: { flexDirection: "row", flexWrap: "wrap", gap: u / 2 },
    damage: {
      flexDirection: "row",
      columnGap: u / 4,
      alignItems: "center",
      borderWidth: 2,
      borderRadius: u / 3,
      paddingHorizontal: u / 3,
    },
    damageTotal: { fontSize: 1.3 * u, lineHeight: 1.8 * u, fontVariant: ["tabular-nums"] },
  } satisfies Record<string, number | ViewStyle | TextStyle>
}
