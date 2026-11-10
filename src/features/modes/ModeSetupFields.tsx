import { SelectField, type SelectOption } from "@/components/SelectField"
import { translate } from "@/i18n/translate"

import { PLANAR_DECKS, SCHEME_DECKS } from "../../../convex/lib/modeDecks"
import type { ModeSetup } from "../../../convex/lib/tableModes"

export interface ModeChoices {
  planar: string
  archenemy: string
  schemes: string
}

export const DEFAULT_MODE_CHOICES: ModeChoices = {
  planar: "off",
  archenemy: "roll",
  schemes: SCHEME_DECKS[0]!.id,
}

const ALL = "all:"
const PRODUCTS = [...new Set(PLANAR_DECKS.map((deck) => deck.product))]

function planarDecksOf(choice: string) {
  if (choice.startsWith(ALL)) {
    const product = choice.slice(ALL.length)
    return PLANAR_DECKS.filter((deck) => deck.product === product).map((deck) => deck.id)
  }
  return [choice]
}

export function modeSetupOf(
  choices: ModeChoices,
  { archenemy, playerCount }: { archenemy: boolean; playerCount: number },
): ModeSetup | undefined {
  const planechase =
    choices.planar === "off"
      ? undefined
      : choices.planar === "own"
        ? {}
        : { decks: planarDecksOf(choices.planar) }
  const seat = Number(choices.archenemy)
  const setup: ModeSetup = {
    ...(planechase ? { planechase } : {}),
    ...(archenemy
      ? {
          archenemy: {
            ...(Number.isInteger(seat) && seat >= 1 && seat <= playerCount ? { seat } : {}),
            ...(choices.schemes === "own" ? {} : { deck: choices.schemes }),
          },
        }
      : {}),
  }
  return setup.planechase || setup.archenemy ? setup : undefined
}

function planarChoiceOf(decks: readonly string[] | undefined) {
  if (!decks) return "own"
  if (decks.length === 1) return decks[0]!
  const product = PRODUCTS.find(
    (candidate) => planarDecksOf(`${ALL}${candidate}`).join() === decks.join(),
  )
  return product ? `${ALL}${product}` : DEFAULT_MODE_CHOICES.planar
}

export function modeChoicesOf(setup: ModeSetup | undefined): ModeChoices {
  const archenemy = setup?.archenemy
  return {
    planar: setup?.planechase
      ? planarChoiceOf(setup.planechase.decks)
      : DEFAULT_MODE_CHOICES.planar,
    archenemy: archenemy?.seat === undefined ? "roll" : String(archenemy.seat),
    schemes: archenemy ? (archenemy.deck ?? "own") : DEFAULT_MODE_CHOICES.schemes,
  }
}

const planarOptions = (): SelectOption[] => [
  { id: "off", label: translate("play:newGame.planechaseOff") },
  { id: "own", label: translate("play:newGame.ownPlanarDeck") },
  ...PRODUCTS.flatMap((product) => {
    const decks = PLANAR_DECKS.filter((deck) => deck.product === product)
    return [
      {
        id: `${ALL}${product}`,
        label: translate("play:newGame.allDecks", { product, count: decks.length }),
      },
      ...decks.map((deck) => ({ id: deck.id, label: deck.name, detail: product })),
    ]
  }),
]

const schemeOptions = (): SelectOption[] => [
  ...SCHEME_DECKS.map((deck) => ({ id: deck.id, label: deck.name, detail: deck.product })),
  { id: "own", label: translate("play:newGame.ownSchemeDeck") },
]

export function ModeSetupFields({
  choices,
  archenemy,
  seatNames,
  disabled,
  onChange,
}: {
  choices: ModeChoices
  archenemy: boolean
  seatNames: readonly string[]
  disabled?: boolean
  onChange: (choices: ModeChoices) => void
}) {
  return (
    <>
      {archenemy ? (
        <>
          <SelectField
            testID="archenemy-seat"
            label={translate("play:newGame.archenemy")}
            field="archenemy"
            value={choices.archenemy}
            disabled={disabled}
            options={[
              { id: "roll", label: translate("play:newGame.rollArchenemy") },
              ...seatNames.map((name, index) => ({ id: String(index + 1), label: name })),
            ]}
            onSelect={(id) => onChange({ ...choices, archenemy: id ?? "roll" })}
          />
          <SelectField
            testID="scheme-deck"
            label={translate("play:newGame.schemeDeck")}
            field="schemes"
            value={choices.schemes}
            disabled={disabled}
            options={schemeOptions()}
            onSelect={(id) => onChange({ ...choices, schemes: id ?? DEFAULT_MODE_CHOICES.schemes })}
          />
        </>
      ) : null}
      <SelectField
        testID="planechase"
        label={translate("play:newGame.planechase")}
        field="planechase"
        value={choices.planar}
        disabled={disabled}
        options={planarOptions()}
        onSelect={(id) => onChange({ ...choices, planar: id ?? "off" })}
      />
    </>
  )
}
