import { Linking } from "react-native"
import { fireEvent, render, waitFor } from "@testing-library/react-native"

import { catalogDb } from "@/storage/catalogDb"
import { localCardDb } from "@/storage/localDb"
import { ThemeProvider } from "@/theme/context"

import { computeDeckOwnership } from "./deckOwnership"
import { StoreCheckoutSheet } from "./StoreCheckoutSheet"

test("a card the store lacks opens in the deck once the sheet closes, and the cart opens at the chosen store", async () => {
  localCardDb.clearAll()
  catalogDb.clearAll()
  catalogDb.replacePrintings(
    "mtg",
    [
      {
        game: "mtg",
        printingId: "sol-cmm",
        cardId: "ora-sol",
        name: "Sol Ring",
        nameNormalized: "sol ring",
        setCode: "cmm",
        collectorNumber: "410",
        finishes: ["nonfoil"],
      },
    ],
    "v1",
  )
  catalogDb.replacePrices("mtg", [
    {
      game: "mtg",
      printingId: "sol-cmm",
      finish: "nonfoil",
      source: "cardkingdom",
      currency: "USD",
      retailCents: 250,
      updatedAt: "2026-11-28T00:00:00Z",
    },
  ])
  const sol = { name: "Sol Ring", oracleId: "ora-sol", quantity: 1 }
  const typo = { name: "Sol Rnig", quantity: 1 }
  const { items } = computeDeckOwnership("mtg", [sol, typo])
  const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true)
  const onOpenCard = jest.fn()
  const onClose = jest.fn()

  const screen = render(
    <ThemeProvider>
      <StoreCheckoutSheet
        visible
        game="mtg"
        items={items}
        onOpenCard={onOpenCard}
        onClose={onClose}
      />
    </ThemeProvider>,
  )

  expect(screen.getByText("Not available at TCGplayer")).toBeTruthy()
  expect(
    screen.getByText("Before shipping · Optimize the TCGplayer cart for this total"),
  ).toBeTruthy()
  expect(screen.getByTestId("store-checkout-open")).toBeDisabled()

  const sheet = (visible: boolean) => (
    <ThemeProvider>
      <StoreCheckoutSheet
        visible={visible}
        game="mtg"
        items={items}
        onOpenCard={onOpenCard}
        onClose={onClose}
      />
    </ThemeProvider>
  )
  fireEvent.press(screen.getByTestId("store-checkout-problem-name:sol rnig"))
  expect(onClose).toHaveBeenCalled()
  expect(onOpenCard).not.toHaveBeenCalled()
  screen.rerender(sheet(false))
  await waitFor(() => expect(onOpenCard).toHaveBeenCalledWith(typo))
  screen.rerender(sheet(true))

  fireEvent.press(screen.getByTestId("store-checkout-cardkingdom"))
  expect(screen.queryByText("Not available at Card Kingdom")).toBeNull()
  expect(screen.getByText("Before shipping")).toBeTruthy()
  fireEvent.press(screen.getByText("Open Card Kingdom with 1 card"))
  expect(openURL).toHaveBeenCalledWith(
    expect.stringContaining("cardkingdom.com/builder?c=1+Sol+Ring"),
  )
})
