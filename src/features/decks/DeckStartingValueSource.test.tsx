import { render } from "@testing-library/react-native"

import { DeckStartingValueSource } from "./DeckStartingValueSource"

let mockValue: number | null | undefined
let mockOnline = true
jest.mock("convex/react", () => ({ useQuery: () => mockValue }))
jest.mock("@/features/connected/useConvexOnline", () => ({ useConvexOnline: () => mockOnline }))

it("reports unknown offline, then pending again once back online until the deck's value loads", () => {
  const onChange = jest.fn()
  mockValue = undefined
  mockOnline = false
  const view = render(<DeckStartingValueSource versionId="v-hero" onChange={onChange} />)
  expect(onChange).toHaveBeenLastCalledWith({ versionId: "v-hero", value: null })

  mockOnline = true
  view.rerender(<DeckStartingValueSource versionId="v-hero" onChange={onChange} />)
  expect(onChange).toHaveBeenLastCalledWith(undefined)

  mockValue = 20
  view.rerender(<DeckStartingValueSource versionId="v-hero" onChange={onChange} />)
  expect(onChange).toHaveBeenLastCalledWith({ versionId: "v-hero", value: 20 })
})
