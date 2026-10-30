import { renderHook } from "@testing-library/react-native"
import { useQuery } from "convex/react"

import { useConvexOnline } from "@/features/connected/useConvexOnline"

import { useCapabilityReleased } from "./useCapabilityReleased"
import { integrationFor } from "../../../convex/lib/integrations"

jest.mock("convex/react", () => ({ useQuery: jest.fn() }))
jest.mock("@/features/connected/useConvexOnline", () => ({ useConvexOnline: jest.fn() }))

const withExampleDecks = (game: "mtg" | "riftbound", release: "enabled" | "disabled") => {
  const integration = integrationFor(game)
  return [
    {
      ...integration,
      capabilities: {
        ...integration.capabilities,
        exampleDecks: { technical: "available", release },
      },
    },
  ]
}

function render(manifest: unknown, online: boolean) {
  jest.mocked(useQuery).mockReturnValue(manifest)
  jest.mocked(useConvexOnline).mockReturnValue(online)
  return renderHook(() => useCapabilityReleased("exampleDecks")).result.current
}

describe("useCapabilityReleased", () => {
  it("uses the static definition until the server answers", () => {
    const released = render(undefined, true)
    expect(released("mtg")).toBe(true)
    expect(released("riftbound")).toBe(false)
    expect(released("not-a-game")).toBe(false)
  })

  it("follows the server's switches while online", () => {
    expect(render(withExampleDecks("mtg", "disabled"), true)("mtg")).toBe(false)
    expect(render(withExampleDecks("riftbound", "enabled"), true)("riftbound")).toBe(true)
  })

  it("offline, only turns things off", () => {
    expect(render(withExampleDecks("mtg", "disabled"), false)("mtg")).toBe(false)
    expect(render(withExampleDecks("riftbound", "enabled"), false)("riftbound")).toBe(false)
    expect(render(undefined, false)("mtg")).toBe(true)
  })
})
