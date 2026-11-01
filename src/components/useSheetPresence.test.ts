import { act, renderHook } from "@testing-library/react-native"

import { useSheetPresence } from "./useSheetPresence"

type Dialog = "actions" | "rename"
const isSheet = (dialog: Dialog) => dialog === "actions"

function renderPresence(initial?: Dialog) {
  return renderHook(
    ({ requested }: { requested: Dialog | undefined }) => useSheetPresence(requested, isSheet),
    { initialProps: { requested: initial } },
  )
}

it("keeps a closing sheet shown until it has left, then shows what was asked for", () => {
  const view = renderPresence("actions")

  view.rerender({ requested: "rename" })
  expect(view.result.current).toMatchObject({ shown: "actions", visible: false })

  act(() => view.result.current.onDismissed())
  expect(view.result.current).toMatchObject({ shown: "rename", visible: true })
})

it("swaps away from something that isn't a sheet at once", () => {
  const view = renderPresence("rename")

  view.rerender({ requested: "actions" })
  expect(view.result.current).toMatchObject({ shown: "actions", visible: true })
})

it("shows the latest request once the sheet has left", () => {
  const view = renderPresence("actions")

  view.rerender({ requested: undefined })
  view.rerender({ requested: "rename" })
  act(() => view.result.current.onDismissed())
  expect(view.result.current.shown).toBe("rename")
})
