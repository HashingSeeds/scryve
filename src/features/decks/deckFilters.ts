import { useCallback, useState } from "react"

import { loadString, saveString } from "@/utils/storage"

import { DECK_GAMES, DEFAULT_DECK_GAME, defaultDeckFormat } from "../../../convex/lib/deckGames"

export const ALL_FORMATS = "all"

const GAME_KEY = "decks.game"

function formatKey(game: string) {
  return `decks.format.${game}`
}

function storedGame() {
  const saved = loadString(GAME_KEY)
  return saved && Object.prototype.hasOwnProperty.call(DECK_GAMES, saved)
    ? saved
    : DEFAULT_DECK_GAME
}

export function useDeckFilters() {
  const [game, setGameState] = useState(storedGame)
  const [format, setFormatState] = useState(
    () => loadString(formatKey(storedGame())) ?? ALL_FORMATS,
  )

  const setFormat = useCallback(
    (next: string) => {
      setFormatState(next)
      saveString(formatKey(game), next)
    },
    [game],
  )

  const setGame = useCallback((next: string) => {
    setGameState(next)
    saveString(GAME_KEY, next)
    setFormatState(loadString(formatKey(next)) ?? ALL_FORMATS)
  }, [])

  return { game, format, setGame, setFormat }
}

export function creationFormat(game: string, filterFormat: string) {
  return filterFormat === ALL_FORMATS ? defaultDeckFormat(game) : filterFormat
}
