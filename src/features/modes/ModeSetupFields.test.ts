import { modeChoicesOf, modeSetupOf } from "./ModeSetupFields"
import { PLANAR_DECKS, SCHEME_DECKS } from "../../../convex/lib/modeDecks"
import type { ModeSetup } from "../../../convex/lib/tableModes"

const product = PLANAR_DECKS[0]!.product
const productDecks = PLANAR_DECKS.filter((deck) => deck.product === product).map(({ id }) => id)

describe("modeChoicesOf", () => {
  it.each<ModeSetup>([
    { planechase: { decks: productDecks } },
    { planechase: {}, archenemy: { seat: 2 } },
    { archenemy: { deck: SCHEME_DECKS[1]!.id } },
  ])("reads a saved setup back into the choices that make it: %j", (setup) => {
    const archenemy = setup.archenemy !== undefined
    expect(modeSetupOf(modeChoicesOf(setup), { archenemy, playerCount: 4 })).toEqual(setup)
  })
})
