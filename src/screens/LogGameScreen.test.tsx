import { StrictMode } from "react"
import { act, fireEvent, render, waitFor } from "@testing-library/react-native"

import { defaultLoggedGameDraft } from "@/features/game/loggedGame"
import type { LocalGame } from "@/features/game/types"
import { ThemeProvider } from "@/theme/context"

import { LogGameScreen } from "./LogGameScreen"

let releasePin: () => void = () => {}
jest.mock("@/features/stats/deckChoices", () => ({
  ...jest.requireActual<typeof import("@/features/stats/deckChoices")>(
    "@/features/stats/deckChoices",
  ),
  pinDeckChoice: () =>
    new Promise((resolve) => {
      releasePin = () => resolve({ deckKey: "deck-key", deckName: "Atraxa" })
    }),
}))

function renderForm(account?: Parameters<typeof LogGameScreen>[0]["account"]) {
  const onSave = jest.fn<void, [LocalGame]>()
  const view = render(
    <StrictMode>
      <ThemeProvider initialContext="light">
        <LogGameScreen
          initialDraft={defaultLoggedGameDraft({ system: "mtg", format: "commander" })}
          account={account}
          onBack={jest.fn()}
          onSave={onSave}
        />
      </ThemeProvider>
    </StrictMode>,
  )
  fireEvent.press(view.getByTestId("log-winner"))
  fireEvent.press(view.getByTestId("log-winner-option-0"))
  return { view, onSave }
}

it("saves an uninterrupted game once", async () => {
  const { view, onSave } = renderForm()
  fireEvent.press(view.getByTestId("log-save"))
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
  expect(onSave.mock.calls[0][0]).toMatchObject({ status: "finished", logged: true })
})

it("drops a save whose deck finishes pinning after the form closes", async () => {
  const deck = { versionId: "v1", name: "Atraxa", system: "mtg", format: "commander" }
  const { view, onSave } = renderForm({ ownerId: "owner", decks: [deck] })
  fireEvent.press(view.getByTestId("me-deck"))
  fireEvent.press(view.getByTestId("me-deck-option-v1"))
  fireEvent.press(view.getByTestId("log-save"))
  view.unmount()
  await act(async () => releasePin())
  expect(onSave).not.toHaveBeenCalled()
})
