import { render } from "@testing-library/react-native"

import LogGameRoute from "@/app/history/log"
import { localGameRepository } from "@/features/game/localPersistence"
import { buildLoggedGame, defaultLoggedGameDraft } from "@/features/game/loggedGame"
import type { LogGameScreen } from "@/screens/LogGameScreen"
import { storage } from "@/utils/storage"

let mockFocused = true
const mockBack = jest.fn()
const mockScreenProps = jest.fn<void, [Parameters<typeof LogGameScreen>[0]]>()
jest.mock("@/features/auth/AuthContext", () => ({
  useAuthAccess: () => ({ configured: true, isSignedIn: false }),
}))
jest.mock("@/features/decks/LocalDeckChoicesSource", () => ({ LocalDeckChoicesSource: () => null }))
jest.mock("@/screens/LogGameScreen", () => ({
  LogGameScreen: (props: Parameters<typeof LogGameScreen>[0]) => {
    mockScreenProps(props)
    return null
  },
}))
jest.mock("expo-router", () => ({
  router: { canGoBack: () => true, back: () => mockBack(), replace: jest.fn() },
  useNavigation: () => ({ isFocused: () => mockFocused }),
}))

function logged() {
  const built = buildLoggedGame(
    { ...defaultLoggedGameDraft({ system: "mtg" }), names: ["Ada", "Grace"], winnerSeat: 0 },
    undefined,
  )
  if (!built.ok) throw new Error(built.error)
  return built.game
}

beforeEach(() => {
  storage.clearAll()
  mockBack.mockClear()
})

it("archives a save and leaves once while the form is on screen", () => {
  mockFocused = true
  render(<LogGameRoute />)
  mockScreenProps.mock.lastCall![0].onSave(logged())
  expect(localGameRepository.loadHistory()).toHaveLength(1)
  expect(mockBack).toHaveBeenCalledTimes(1)
})

it("ignores a save that lands after Back started leaving the form", () => {
  mockFocused = false
  render(<LogGameRoute />)
  mockScreenProps.mock.lastCall![0].onSave(logged())
  expect(localGameRepository.loadHistory()).toHaveLength(0)
  expect(mockBack).not.toHaveBeenCalled()
})
