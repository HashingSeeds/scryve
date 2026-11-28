import { Pressable } from "react-native"
import { fireEvent, render } from "@testing-library/react-native"

import { Text } from "@/components/Text"
import { catalogDb } from "@/storage/catalogDb"
import { ThemeProvider } from "@/theme/context"

import { useChangePrinting } from "./useChangePrinting"

type Card = { name: string; oracleId: string; scryfallId: string; quantity: number }

function Harness({ replace }: { replace: (previous: Card, next: Card) => string | undefined }) {
  const changePrinting = useChangePrinting<Card>("mtg")
  const card = { name: "Sol Ring", oracleId: "ora-sol", scryfallId: "sol-cmm", quantity: 1 }
  return (
    <>
      <Pressable
        testID="start"
        onPress={() => {
          changePrinting.start(card, () => {})
          changePrinting.focusDismissed()
        }}
      >
        <Text text="start" />
      </Pressable>
      {changePrinting.sheet(replace)}
    </>
  )
}

test("a printing the deck can't take keeps the list open and says why", () => {
  catalogDb.clearAll()
  catalogDb.replacePrintings(
    "mtg",
    ["sol-cmm", "sol-c21"].map((printingId) => ({
      game: "mtg",
      printingId,
      cardId: "ora-sol",
      name: "Sol Ring",
      nameNormalized: "sol ring",
      setCode: printingId.slice(4),
      collectorNumber: "1",
      finishes: ["nonfoil"],
    })),
    "v1",
  )
  const replace = jest.fn(() => "Offline. Pick a card you've added before.")
  const view = render(
    <ThemeProvider>
      <Harness replace={replace} />
    </ThemeProvider>,
  )

  fireEvent.press(view.getByTestId("start"))
  fireEvent.press(view.getByTestId("printing-option-sol-c21"))

  expect(replace).toHaveBeenCalledWith(
    expect.objectContaining({ scryfallId: "sol-cmm" }),
    expect.objectContaining({ scryfallId: "sol-c21" }),
  )
  expect(view.getByText("Offline. Pick a card you've added before.")).toBeTruthy()
  expect(view.getByTestId("printing-picker-sheet")).toBeTruthy()
})
