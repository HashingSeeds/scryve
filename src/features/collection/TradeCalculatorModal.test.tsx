import type { ComponentProps } from "react"
import { act, fireEvent, render } from "@testing-library/react-native"

import { cardNameIndex, type CardNameIndex } from "@/features/decks/cardNameMatch"
import type { CardScanner } from "@/features/decks/CardScanner"
import { catalogDb } from "@/storage/catalogDb"
import { ThemeProvider } from "@/theme/context"

import { TradeCalculatorModal } from "./TradeCalculatorModal"

let mockScanner: ComponentProps<typeof CardScanner> | undefined
jest.mock("@/features/decks/CardScanner", () => ({
  CardScanner: (props: ComponentProps<typeof CardScanner>) => {
    mockScanner = props
    return null
  },
}))
let mockNameIndex: CardNameIndex | undefined
jest.mock("@/features/decks/useCardNameIndex", () => ({
  useCardNameIndex: () => mockNameIndex,
}))

test("a partial name suggests card names, and picking one lists its printings", () => {
  catalogDb.clearAll()
  catalogDb.replacePrintings(
    "mtg",
    [
      {
        game: "mtg",
        printingId: "cmm-410",
        cardId: "ora-sol",
        name: "Sol Ring",
        nameNormalized: "sol ring",
        setCode: "cmm",
        setName: "cmm",
        collectorNumber: "410",
        finishes: ["nonfoil"],
      },
    ],
    "v1",
  )
  mockNameIndex = cardNameIndex(["Sol Ring", "Sol Talisman", "Lightning Bolt"])
  const view = render(
    <ThemeProvider initialContext="dark">
      <TradeCalculatorModal visible game="mtg" onClose={jest.fn()} />
    </ThemeProvider>,
  )
  const input = view.getByTestId("trade-search-input")

  fireEvent.changeText(input, "zzqx")
  expect(view.getByText("No cards found.")).toBeTruthy()

  fireEvent.changeText(input, "Sol Ri")
  fireEvent.press(view.getByText("Sol Ring"))
  fireEvent.press(view.getByText("Sol Ring · CMM · #410"))

  expect(view.getByText("CMM · #410 · $0.00")).toBeTruthy()
  mockNameIndex = undefined
  catalogDb.clearAll()
})

test("a printing refined after a trade scan moves that copy and its price to the new printing", () => {
  catalogDb.clearAll()
  catalogDb.replacePrintings(
    "mtg",
    [
      { id: "cmm-410", set: "cmm", number: "410" },
      { id: "40k-240", set: "40k", number: "240" },
    ].map(({ id, set, number }) => ({
      game: "mtg",
      printingId: id,
      cardId: "ora-sol",
      name: "Sol Ring",
      nameNormalized: "sol ring",
      setCode: set,
      setName: set,
      collectorNumber: number,
      finishes: ["nonfoil", "foil"],
    })),
    "v1",
  )
  const view = render(
    <ThemeProvider initialContext="dark">
      <TradeCalculatorModal visible game="mtg" onClose={jest.fn()} />
    </ThemeProvider>,
  )
  fireEvent.press(view.getByTestId("trade-scan-button"))
  const scan = {
    name: "Sol Ring",
    printingId: "cmm-410",
    finish: "nonfoil",
    condition: "NM",
    language: "en",
    retailCents: 100,
  } as const
  act(() => {
    mockScanner?.onScanPrinting?.({ ...scan, id: 0 })
    mockScanner?.onScanPrinting?.({ ...scan, id: 1 })
    mockScanner?.onScanPrinting?.({
      ...scan,
      id: 2,
      printingId: "40k-240",
      finish: "foil",
      retailCents: undefined,
    })
  })

  let accepted: boolean | void = false
  act(() => {
    accepted = mockScanner?.onUpdatePrinting?.(1, {
      name: "Sol Ring",
      printingId: "40k-240",
      setCode: "40k",
      collectorNumber: "240",
      finish: "foil",
      condition: "NM",
      retailCents: 900,
    })
  })

  expect(accepted).toBe(true)
  expect(view.getByText("CMM · #410 · $1.00")).toBeTruthy()
  expect(view.getByText("40K · #240 · Foil · $18.00")).toBeTruthy()
  expect(view.getByText("$19.00")).toBeTruthy()

  act(() => {
    mockScanner?.onUpdatePrinting?.(0, {
      name: "Sol Ring",
      printingId: "cmm-410",
      setCode: "cmm",
      collectorNumber: "410",
      finish: "nonfoil",
      condition: "NM",
      retailCents: 300,
    })
  })
  expect(view.getByText("CMM · #410 · $3.00")).toBeTruthy()

  act(() => {
    mockScanner?.onUpdatePrinting?.(0, {
      name: "Sol Ring",
      printingId: "cmm-410",
      setCode: "cmm",
      collectorNumber: "410",
      finish: "nonfoil",
      condition: "NM",
    })
  })
  expect(view.getByText("CMM · #410 · $3.00")).toBeTruthy()
  catalogDb.clearAll()
})
