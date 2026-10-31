import { render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { analyzeDeck } from "./deckAnalysis"
import { DeckBuildTools } from "./DeckBuildTools"

const cards = [
  { name: "Grizzly Bears", quantity: 3, board: "main" as const },
  { name: "Forest", quantity: 1, board: "main" as const },
]

function renderTools(typeLines: Record<string, string>) {
  const analysis = analyzeDeck({
    cards,
    format: "commander",
    details: (card) =>
      typeLines[card.name] ? { typeLine: typeLines[card.name], manaCost: "{1}{G}" } : undefined,
  })
  return render(
    <ThemeProvider initialContext="dark">
      <DeckBuildTools analysis={analysis} onFind={jest.fn()} onAnalysis={jest.fn()} />
    </ThemeProvider>,
  )
}

describe("DeckBuildTools", () => {
  it("shows dashes instead of counts when most cards have no details", () => {
    const view = renderTools({ Forest: "Basic Land — Forest" })
    expect(view.getByLabelText("Lands –")).toBeTruthy()
    expect(view.getByLabelText("Avg –")).toBeTruthy()
  })

  it("shows counts once most cards have details", () => {
    const view = renderTools({
      "Grizzly Bears": "Creature — Bear",
      "Forest": "Basic Land — Forest",
    })
    expect(view.getByLabelText("Lands 1")).toBeTruthy()
  })
})
