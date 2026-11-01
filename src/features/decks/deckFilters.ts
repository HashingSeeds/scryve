import { useCallback, useState } from "react"

import { isSystemVisible } from "@/features/game/systemVisibility"
import { load, loadString, save, saveString } from "@/utils/storage"

import { isColorMatch, SEARCH_COLORS, type ColorMatch } from "./colorMatch"
import { DEFAULT_DECK_GAME, defaultDeckFormat } from "../../../convex/lib/deckGames"

export const ALL_FORMATS = "all"

const GAME_KEY = "decks.game"
const COLORS_KEY = "decks.colors"
const COLOR_MATCH_KEY = "decks.colorMatch"
export const DEFAULT_COLOR_MATCH: ColorMatch = "exact"

function formatKey(game: string) {
  return `decks.format.${game}`
}

function storedGame() {
  const saved = loadString(GAME_KEY)
  return saved && isSystemVisible(saved) ? saved : DEFAULT_DECK_GAME
}

function storedColors() {
  const saved = load(COLORS_KEY)
  return Array.isArray(saved) ? SEARCH_COLORS.filter((color) => saved.includes(color)) : []
}

function storedColorMatch() {
  const saved = loadString(COLOR_MATCH_KEY)
  return isColorMatch(saved) ? saved : DEFAULT_COLOR_MATCH
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

  const setGame = useCallback((next: string, nextFormat?: string) => {
    setGameState(next)
    saveString(GAME_KEY, next)
    const format = nextFormat ?? loadString(formatKey(next)) ?? ALL_FORMATS
    setFormatState(format)
    if (nextFormat !== undefined) saveString(formatKey(next), nextFormat)
  }, [])

  const [colors, setColorsState] = useState<readonly string[]>(storedColors)
  const [colorMatch, setColorMatchState] = useState(storedColorMatch)

  const setColors = useCallback((next: readonly string[]) => {
    setColorsState(next)
    save(COLORS_KEY, next)
  }, [])

  const setColorMatch = useCallback((next: ColorMatch) => {
    setColorMatchState(next)
    saveString(COLOR_MATCH_KEY, next)
  }, [])

  return { game, format, setGame, setFormat, colors, setColors, colorMatch, setColorMatch }
}

export function creationFormat(game: string, filterFormat: string) {
  return filterFormat === ALL_FORMATS ? defaultDeckFormat(game) : filterFormat
}
