import { AccessibilityInfo } from "react-native"
import * as Haptics from "expo-haptics"
import { act, fireEvent, render, screen } from "@testing-library/react-native"

import { localGameRepository } from "@/features/game/localPersistence"
import { ThemeProvider } from "@/theme/context"
import { resetReducedMotionCacheForTests } from "@/utils/useReducedMotion"

import { PokemonKeypad } from "./PokemonKeypad"

it("follows the haptics setting changed while the keypad is open", async () => {
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false)
  resetReducedMotionCacheForTests()
  jest.mocked(Haptics.selectionAsync).mockClear()
  const settings = localGameRepository.loadSettings()
  localGameRepository.saveSettings({ ...settings, hapticsEnabled: true })
  render(
    <ThemeProvider initialContext="dark">
      <PokemonKeypad
        seatNumber={1}
        ink="#FFFFFF"
        digitsOnly={false}
        capitalize={false}
        onType={jest.fn()}
        onDelete={jest.fn()}
        onDone={jest.fn()}
      />
    </ThemeProvider>,
  )
  await act(async () => undefined)

  fireEvent.press(screen.getByTestId("pokemon-key-a-seat-1"))
  expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1)

  localGameRepository.saveSettings({ ...settings, hapticsEnabled: false })
  fireEvent.press(screen.getByTestId("pokemon-key-a-seat-1"))
  expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1)

  localGameRepository.saveSettings(settings)
  jest.restoreAllMocks()
  resetReducedMotionCacheForTests()
})
