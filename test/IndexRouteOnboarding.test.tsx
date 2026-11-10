import { fireEvent, render } from "@testing-library/react-native"

import type { LocalGameRepository } from "@/features/game/localPersistence"
import { ThemeProvider } from "@/theme/context"

import Index from "../src/app/index"

jest.mock("@/features/game/localPersistence", () => {
  const actual = jest.requireActual("@/features/game/localPersistence")
  const { MemoryStorage: Storage } = jest.requireActual("./support/memoryStorage")
  return { ...actual, localGameRepository: new actual.LocalGameRepository(new Storage()) }
})
jest.mock("expo-router", () => ({
  Redirect: () => null,
  router: { push: jest.fn(), replace: jest.fn() },
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => ({}),
}))
jest.mock("@/features/auth/AuthContext", () => ({
  useAuthAccess: () => ({ configured: false, isLoaded: true, isSignedIn: false }),
}))
jest.mock("@/features/auth/useAccountEntry", () => ({ useAccountEntry: () => ({}) }))
jest.mock("@/features/connected/useResumeGames", () => ({ useNewestResumeGame: () => null }))
jest.mock("@/features/updates/storeUpdate", () => ({
  updateFromStore: jest.fn(),
  useStoreUpdate: () => undefined,
}))
jest.mock("@/features/updates/appUpdate", () => ({ restartIntoNewestUpdate: jest.fn() }))
jest.mock("@/features/lan/lanAvailability", () => ({
  lanPlayAvailable: () => false,
  savedHostedGame: () => undefined,
}))
jest.mock("@/features/legal/useFirstUseSharing", () => ({
  useFirstUseSharing: () => ({
    configured: false,
    sharing: false,
    setSharing: jest.fn(),
    saveFailed: false,
    saveSharing: () => true,
  }),
}))
jest.mock("@/screens/CurrentGameScreen", () => ({ CurrentGameScreen: () => null }))
jest.mock("@/screens/NewerGameScreen", () => ({ NewerGameScreen: () => null }))

const { localGameRepository } = jest.requireMock<{ localGameRepository: LocalGameRepository }>(
  "@/features/game/localPersistence",
)

describe("first launch", () => {
  it("keeps Turns when Play finishes onboarding", () => {
    const view = render(
      <ThemeProvider>
        <Index />
      </ThemeProvider>,
    )
    fireEvent.press(view.getByTestId("turns-choice-turns"))
    fireEvent.press(view.getByText("No system"))
    fireEvent.press(view.getByTestId("what-you-play-start"))

    expect(localGameRepository.turnsEnabled()).toBe(true)
    expect(localGameRepository.loadSettings().askWhatYouPlay).toBeUndefined()
  })
})
