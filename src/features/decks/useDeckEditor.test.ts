import { act, renderHook } from "@testing-library/react-native"

import { openDeckDraft } from "./deckDraft"
import { useDeckEditor } from "./useDeckEditor"

const modern = { game: "mtg", format: "modern" }
const card = (name: string, quantity = 1) => ({ name, quantity, scryfallId: name })

it("applies every edit from an earlier render and returns the rule an edit breaks", () => {
  const { result } = renderHook(() =>
    useDeckEditor(openDeckDraft({ cards: [card("Rats", 999)], note: "", fromCache: false })),
  )
  const { edit } = result.current
  act(() => {
    expect(edit({ type: "add", card: card("Island") }, modern)).toBeUndefined()
    expect(edit({ type: "add", card: card("Forest") }, modern)).toBeUndefined()
    expect(edit({ type: "add", card: card("Rats") }, modern)).toBe(
      "A card can have at most 999 copies.",
    )
  })
  expect(result.current.draft.cards.map(({ name, quantity }) => `${quantity} ${name}`)).toEqual([
    "999 Rats",
    "1 Island",
    "1 Forest",
  ])
})
