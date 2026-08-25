import { fireEvent, render, waitFor } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { BlockedPlayersSection } from "./BlockedPlayersSection"

const mockUnblock = jest.fn().mockResolvedValue(undefined)
let mockIsAuthenticated = true
let mockIsAuthLoading = false
let mockBlocks: { blockedUserId: string; username: string }[] | undefined
let mockQueryFails = false

jest.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: mockIsAuthenticated, isLoading: mockIsAuthLoading }),
  useMutation: () => mockUnblock,
  useQuery: () => {
    if (mockQueryFails) throw new Error("Query failed")
    return mockBlocks
  },
}))

function renderSection() {
  return render(
    <ThemeProvider initialContext="dark">
      <BlockedPlayersSection />
    </ThemeProvider>,
  )
}

describe("BlockedPlayersSection", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockIsAuthenticated = true
    mockIsAuthLoading = false
    mockBlocks = undefined
    mockQueryFails = false
  })

  it("reserves the section while blocked players load", () => {
    const view = renderSection()

    expect(view.getByTestId("blocked-players-loading")).toBeTruthy()
    expect(view.getByLabelText("Loading blocked players")).toBeTruthy()
    expect(view.getByTestId("blocked-players-state").props.style).toEqual(
      expect.objectContaining({ minHeight: 68 }),
    )
  })

  it("keeps the reserved section when the list is empty", () => {
    mockBlocks = []
    const view = renderSection()

    expect(view.getByTestId("blocked-players-empty")).toHaveTextContent("No blocked players.")
    expect(view.getByTestId("blocked-players-state").props.style).toEqual(
      expect.objectContaining({ minHeight: 68 }),
    )
  })

  it("labels unblock actions with the player name", async () => {
    mockBlocks = [{ blockedUserId: "player-1", username: "Alex" }]
    const view = renderSection()

    fireEvent.press(view.getByLabelText("Unblock Alex"))

    await waitFor(() => expect(mockUnblock).toHaveBeenCalledWith({ blockedUserId: "player-1" }))
  })

  it("contains query errors and retries inside the section", () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined)
    mockQueryFails = true
    const view = renderSection()

    expect(view.getByRole("alert")).toHaveTextContent("Couldn't load blocked players.")
    mockQueryFails = false
    fireEvent.press(view.getByText("Retry"))

    expect(view.getByTestId("blocked-players-loading")).toBeTruthy()
    consoleError.mockRestore()
  })
})
