import { act, fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { LOCAL_KEYS, LocalGameRepository } from "./localPersistence"
import { TurnsChoice } from "./TurnsChoice"
import { MemoryStorage } from "../../../test/support/memoryStorage"

describe("turns are opt-in", () => {
  it("are off on a new device and on one that saved the old 'off'", () => {
    expect(new LocalGameRepository(new MemoryStorage()).turnsEnabled()).toBe(false)
    const storage = new MemoryStorage()
    storage.set(
      LOCAL_KEYS.settings,
      JSON.stringify({
        ...new LocalGameRepository(new MemoryStorage()).loadSettings(),
        turnTab: false,
      }),
    )
    expect(new LocalGameRepository(storage).turnsEnabled()).toBe(false)
  })

  it("saves the setup row's choice, and every mounted reader follows it", () => {
    const storage = new MemoryStorage()
    const repository = new LocalGameRepository(storage)
    const view = render(
      <ThemeProvider>
        <TurnsChoice repository={repository} />
        <TurnsChoice repository={new LocalGameRepository(storage)} />
      </ThemeProvider>,
    )
    const [lifeOnly] = view.getAllByTestId("turns-choice-life")
    expect(lifeOnly.props.accessibilityState).toMatchObject({ checked: true })

    fireEvent.press(view.getAllByTestId("turns-choice-turns")[0])
    expect(new LocalGameRepository(storage).turnsEnabled()).toBe(true)
    expect(
      view
        .getAllByTestId("turns-choice-turns")
        .map((choice) => choice.props.accessibilityState?.checked),
    ).toEqual([true, true])

    act(() => repository.saveTurnsEnabled(false))
    expect(
      view
        .getAllByTestId("turns-choice-life")
        .map((choice) => choice.props.accessibilityState?.checked),
    ).toEqual([true, true])
  })

  it("saves a chess clock with its minutes, and dropping back to turns clears them", () => {
    const repository = new LocalGameRepository(new MemoryStorage())
    const view = render(
      <ThemeProvider>
        <TurnsChoice repository={repository} />
      </ThemeProvider>,
    )
    expect(view.queryByTestId("turns-chess-20")).toBeNull()

    fireEvent.press(view.getByTestId("turns-choice-chess"))
    expect(repository.turnsEnabled()).toBe(true)
    expect(repository.chessMinutes()).toBe(20)

    fireEvent.press(view.getByTestId("turns-chess-10"))
    expect(repository.chessMinutes()).toBe(10)

    fireEvent.press(view.getByTestId("turns-choice-turns"))
    expect(repository.turnsEnabled()).toBe(true)
    expect(repository.chessMinutes()).toBeUndefined()
    expect(view.queryByTestId("turns-chess-10")).toBeNull()
  })
})
