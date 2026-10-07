import { renderHook } from "@testing-library/react-native"

import { remove, save } from "@/utils/storage"

import { readSessionHint, useSessionHint, writeSessionHint } from "./sessionHint"

const KEY = "count.auth.session-hint.v1"

describe("session hint", () => {
  beforeEach(() => remove(KEY))

  it.each([
    ["missing", undefined],
    ["an empty id", { userId: "" }],
    ["a non-string id", { userId: 7 }],
    ["a malformed record", "user-1"],
  ])("ignores %s", (_, stored) => {
    if (stored !== undefined) save(KEY, stored)
    expect(readSessionHint()).toBeUndefined()
  })

  it("round-trips a signed-in account and an explicit sign-out", () => {
    writeSessionHint({ userId: "user-1" })
    expect(readSessionHint()).toEqual({ userId: "user-1" })
    writeSessionHint({ userId: null })
    expect(readSessionHint()).toEqual({ userId: null })
  })

  it("offers the launch hint only until Clerk loads", () => {
    writeSessionHint({ userId: "user-1" })
    const { result, rerender } = renderHook(useSessionHint, {
      initialProps: { isLoaded: false, isSignedIn: false, userId: undefined as string | undefined },
    })
    expect(result.current).toEqual({ userId: "user-1" })

    rerender({ isLoaded: true, isSignedIn: true, userId: "user-1" })
    expect(result.current).toBeUndefined()
  })

  it("records whatever session Clerk confirms, including sign-out and account switches", () => {
    const { rerender } = renderHook(useSessionHint, {
      initialProps: { isLoaded: true, isSignedIn: true, userId: "user-1" as string | undefined },
    })
    expect(readSessionHint()).toEqual({ userId: "user-1" })

    rerender({ isLoaded: true, isSignedIn: false, userId: undefined })
    expect(readSessionHint()).toEqual({ userId: null })

    rerender({ isLoaded: true, isSignedIn: true, userId: "user-2" })
    expect(readSessionHint()).toEqual({ userId: "user-2" })
  })

  it("leaves the hint alone while Clerk is loading or has not reported a user id", () => {
    writeSessionHint({ userId: "user-1" })
    const { rerender } = renderHook(useSessionHint, {
      initialProps: { isLoaded: false, isSignedIn: false, userId: undefined as string | undefined },
    })
    rerender({ isLoaded: true, isSignedIn: true, userId: undefined })
    expect(readSessionHint()).toEqual({ userId: "user-1" })
  })
})
