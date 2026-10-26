import type { ComponentProps, memo } from "react"
import { act, render } from "@testing-library/react-native"

import { DEFAULT_LOCAL_SETTINGS, localGameRepository } from "@/features/game/localPersistence"
import { ThemeProvider } from "@/theme/context"

import Index from "../src/app/index"

const mockRenders = new Map<number, number>()
const mockFocusEffects: (() => void)[] = []

jest.mock("@/components/LifeCard", () => {
  const { memo: rememo }: typeof import("react") = jest.requireActual("react")
  const actual: typeof import("@/components/LifeCard") = jest.requireActual("@/components/LifeCard")
  const { type: Card, compare } = actual.LifeCard as typeof actual.LifeCard & {
    compare: Parameters<typeof memo>[1]
  }
  const CountedCard = (props: ComponentProps<typeof actual.LifeCard>) => {
    mockRenders.set(props.seatNumber, (mockRenders.get(props.seatNumber) ?? 0) + 1)
    return <Card {...props} />
  }
  return { ...actual, LifeCard: rememo(CountedCard, compare) }
})
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({}),
  useFocusEffect: (effect: () => void) => {
    mockFocusEffects.push(effect)
    require("react").useEffect(effect, [effect])
  },
  Redirect: () => null,
}))
jest.mock("@/features/legal/LegalConsentGate", () => ({ useLegalConsentSettled: () => true }))
jest.mock("@/features/auth/AuthContext", () => ({
  useAuthAccess: () => ({ isLoaded: true, isSignedIn: false, openAuth: jest.fn() }),
}))

function refocus() {
  act(() => mockFocusEffects[mockFocusEffects.length - 1]?.())
}

describe("returning to the board", () => {
  beforeEach(() => {
    localGameRepository.clearActiveGame()
    localGameRepository.saveSettings({ ...DEFAULT_LOCAL_SETTINGS, defaultPlayerCount: 4 })
    mockFocusEffects.length = 0
  })

  it("re-renders no seat when nothing was saved under it", () => {
    render(
      <ThemeProvider>
        <Index />
      </ThemeProvider>,
    )
    mockRenders.clear()

    refocus()

    expect(Object.fromEntries(mockRenders)).toEqual({})
  })
})
