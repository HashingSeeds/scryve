import type { ReactNode } from "react"
import { render } from "@testing-library/react-native"

import { PlayerGrid } from "@/components/PlayerGrid"
import { asGameId, asPlayerId } from "@/features/game/domain"
import type { LocalGame, LocalGameSummary } from "@/features/game/types"
import { localChanges, localSummaryModel } from "@/screens/gameSummary"
import { GameSummaryScreen } from "@/screens/GameSummaryScreen"
import { HistoryScreen } from "@/screens/HistoryScreen"
import { ThemeProvider } from "@/theme/context"

import { PSEUDO_LOCALE } from "./format"
import { localeProblems, visibleTexts } from "../../test/pseudoLocale"

import { i18n } from "."

jest.mock("@/utils/useStoreReview", () => ({ useStoreReview: jest.fn() }))

const NOW = new Date("2026-08-11T20:00:00Z").getTime()
const PLAYER_NAMES = ["Ada", "Ben", "Cy", "Dee"]
const players = PLAYER_NAMES.map((name, seat) => ({
  id: asPlayerId(`p${seat + 1}`),
  name,
  color: "#41476E",
  life: 40 - seat * 7,
  seat,
}))

function themed(children: ReactNode) {
  return <ThemeProvider initialContext="light">{children}</ThemeProvider>
}

function finishedGame(): LocalGame {
  return {
    schemaVersion: 1,
    id: asGameId("game-1"),
    status: "finished",
    startingLife: 40,
    format: "commander",
    system: "mtg",
    createdAt: NOW - 34 * 60 * 1000,
    updatedAt: NOW,
    finishedAt: NOW,
    players: players.map(({ id, name, color, life, seat }) => ({ id, name, color, life, seat })),
    events: [],
  }
}

function historyGame(): LocalGameSummary {
  const { events: _events, updatedAt: _updatedAt, ...game } = finishedGame()
  return { ...game, eventCount: 14 } as LocalGameSummary
}

describe(`the ${PSEUDO_LOCALE} pseudo-locale`, () => {
  beforeAll(() => i18n.changeLanguage(PSEUDO_LOCALE))
  afterAll(() => i18n.changeLanguage("en-US"))

  it("shows the board's life totals in formatted digits and translated copy", () => {
    const view = render(
      themed(<PlayerGrid players={players} onChange={jest.fn()} commanderDamage={undefined} />),
    )

    expect(visibleTexts(view)).toContain("\u0664\u0660")
    expect(localeProblems(view, PLAYER_NAMES)).toEqual([])
  })

  it("formats every number and translates every label on the game summary", () => {
    const game = finishedGame()
    const view = render(
      themed(
        <GameSummaryScreen
          summary={{ status: "ready", value: localSummaryModel(game) }}
          timeline={{
            status: "ready",
            items: localChanges(game),
            nextPage: { status: "exhausted" },
            olderEventsDropped: false,
          }}
          onBack={jest.fn()}
        />,
      ),
    )

    expect(localeProblems(view, PLAYER_NAMES)).toEqual([])
  })

  it("formats every number and translates every label in history", () => {
    const view = render(
      themed(
        <HistoryScreen
          games={[historyGame()]}
          onBack={jest.fn()}
          onSelectLocal={jest.fn()}
          onSelectConnected={jest.fn()}
          onSelectManual={jest.fn()}
        />,
      ),
    )

    expect(localeProblems(view, PLAYER_NAMES)).toEqual([])
  })
})
