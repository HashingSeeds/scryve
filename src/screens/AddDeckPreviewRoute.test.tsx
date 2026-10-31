import { View } from "react-native"
import { render } from "@testing-library/react-native"

import AddDeckPreviewRoute from "../app/connected/decks/add/preview"

const mockLeavePreview = jest.fn()
let mockReview: React.ReactElement | undefined

jest.mock("expo-router", () => ({
  Redirect: ({ href }: { href: string }) => {
    const { View } = jest.requireActual("react-native")
    return <View testID={`redirect ${href}`} />
  },
}))

jest.mock("@/screens/AddDeckScreen", () => ({
  useAddDeckFlow: () => ({ review: mockReview, leavePreview: mockLeavePreview }),
}))

describe("add deck preview route", () => {
  beforeEach(() => mockLeavePreview.mockClear())

  it("clears the preview only when the route leaves the stack", () => {
    mockReview = <View testID="review" />
    const view = render(<AddDeckPreviewRoute />)

    expect(view.getByTestId("review")).toBeTruthy()
    view.rerender(<AddDeckPreviewRoute />)
    expect(mockLeavePreview).not.toHaveBeenCalled()

    view.unmount()
    expect(mockLeavePreview).toHaveBeenCalledTimes(1)
  })

  it("sends a reload with no preview back to Add Deck", () => {
    mockReview = undefined
    const view = render(<AddDeckPreviewRoute />)

    expect(view.getByTestId("redirect /connected/decks/add")).toBeTruthy()
  })
})
