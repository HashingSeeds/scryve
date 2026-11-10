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
})
