import { createElement, type ContextType, type ReactNode } from "react"
import { act, renderHook } from "@testing-library/react-native"
import { NavigationContext, NavigationRouteContext } from "expo-router/react-navigation"

import { createLocalGame } from "@/features/game/domain"
import { localGameRepository } from "@/features/game/localPersistence"

import { useBackLabel, type BackRoute } from "./useBackLabel"

type Routes = { key: string; name: string }[]

function stack(routes: Routes) {
  const listeners = new Set<() => void>()
  const navigation = {
    getState: () => ({ routes }),
    addListener: (_event: "state", listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(
      NavigationContext.Provider,
      { value: navigation as unknown as NonNullable<ContextType<typeof NavigationContext>> },
      createElement(
        NavigationRouteContext.Provider,
        { value: { key: "here", name: "here" } },
        children,
      ),
    )
  const push = (next: Routes) => {
    routes = next
    listeners.forEach((listener) => listener())
  }
  return { wrapper, push }
}

function labelOver(below?: string, fallback?: BackRoute) {
  const { wrapper } = stack([
    ...(below ? [{ key: "below", name: below }] : []),
    { key: "here", name: "here" },
  ])
  return renderHook(() => useBackLabel(fallback), { wrapper }).result.current
}

describe("useBackLabel", () => {
  beforeEach(() => localGameRepository.clearActiveGame())

  it("names the screen under this one, or Back for one without a short title", () => {
    expect(labelOver("connected/game/[gameId]")).toBe("Game")
    expect(labelOver("connected/lobby/[gameId]")).toBe("Lobby")
    expect(labelOver("settings/index")).toBe("Settings")
    expect(labelOver("feedback/mine")).toBe("Back")
  })

  it("names where back falls back to when nothing is under it", () => {
    expect(labelOver()).toBe("Play")
    expect(labelOver(undefined, "connected/decks/index")).toBe("Decks")
    expect(renderHook(() => useBackLabel()).result.current).toBe("Play")
  })

  it("calls Play's route Game while a local game runs", () => {
    localGameRepository.saveActiveGame(
      createLocalGame({
        startingLife: 20,
        players: [
          { name: "One", color: "#000" },
          { name: "Two", color: "#111" },
        ],
      }),
    )
    expect(labelOver("index")).toBe("Game")
  })

  it("updates once the stack holds this screen", () => {
    const { wrapper, push } = stack([])
    const view = renderHook(() => useBackLabel(), { wrapper })
    act(() =>
      push([
        { key: "below", name: "rules" },
        { key: "here", name: "here" },
      ]),
    )
    expect(view.result.current).toBe("Rules")
  })
})
