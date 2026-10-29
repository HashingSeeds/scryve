import { AccessibilityInfo } from "react-native"
import * as Haptics from "expo-haptics"
import { act, fireEvent, render, screen } from "@testing-library/react-native"

import { localGameRepository } from "@/features/game/localPersistence"
import { ThemeProvider } from "@/theme/context"
import { resetReducedMotionCacheForTests } from "@/utils/useReducedMotion"

import { PokemonKeypad } from "./PokemonKeypad"

function renderKeypad(onType = jest.fn()) {
  render(
    <ThemeProvider initialContext="dark">
      <PokemonKeypad
        seatNumber={1}
        ink="#FFFFFF"
        digitsOnly={false}
        capitalize={false}
        onType={onType}
        onDelete={jest.fn()}
        onDone={jest.fn()}
      />
    </ThemeProvider>,
  )
  return onType
}

function press(...keys: string[]) {
  for (const key of keys) fireEvent.press(screen.getByTestId(`pokemon-key-${key}-seat-1`))
}

afterEach(() => {
  jest.restoreAllMocks()
  resetReducedMotionCacheForTests()
})

it("follows the haptics setting changed while the keypad is open", async () => {
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false)
  resetReducedMotionCacheForTests()
  jest.mocked(Haptics.selectionAsync).mockClear()
  const settings = localGameRepository.loadSettings()
  localGameRepository.saveSettings({ ...settings, hapticsEnabled: true })
  renderKeypad()
  await act(async () => undefined)

  press("a")
  expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1)

  localGameRepository.saveSettings({ ...settings, hapticsEnabled: false })
  press("a")
  expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1)

  localGameRepository.saveSettings(settings)
})

it("ticks a haptic for each keypad press once Reduce Motion is known to be off", async () => {
  let resolve!: (value: boolean) => void
  jest
    .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockReturnValue(new Promise<boolean>((done) => (resolve = done)))
  resetReducedMotionCacheForTests()
  jest.mocked(Haptics.selectionAsync).mockClear()
  renderKeypad()

  press("a")
  expect(Haptics.selectionAsync).not.toHaveBeenCalled()

  await act(async () => resolve(false))
  press("a", "shift", "delete")
  expect(Haptics.selectionAsync).toHaveBeenCalledTimes(3)
})

it("types punctuation from the keypad's number layer", () => {
  const onType = renderKeypad()
  press("h", "o", "numbers", "-", "letters", "shift", "o", "h")
  expect(onType.mock.calls.map(([text]) => text).join("")).toBe("ho-Oh")
})
