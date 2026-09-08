import { act, fireEvent, render, waitFor } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { CardImage } from "./CardImage"

const mockFallbacks = jest.fn<Promise<string[]>, [unknown]>()
jest.mock("convex/react", () => ({
  useConvex: () => ({ action: (_reference: unknown, args: unknown) => mockFallbacks(args) }),
}))

const style = { width: 36, height: 50 }
const previewStyle = { width: 180, height: 250 }
function cards(id: string, source?: string, preview = false) {
  return (
    <ThemeProvider initialContext="dark">
      <CardImage
        game="pokemon"
        cardId={id}
        source={source}
        style={style}
        accessibilityLabel="Dhelmise"
        testID="thumb"
        compact
      />
      {preview ? (
        <CardImage
          game="pokemon"
          cardId={id}
          source={source}
          style={previewStyle}
          accessibilityLabel="Dhelmise"
          testID="preview"
        />
      ) : null}
    </ThemeProvider>
  )
}
beforeEach(() => mockFallbacks.mockReset())

it("shares a replacement between thumbnail and preview after an image error", async () => {
  mockFallbacks.mockResolvedValue(["broken", "working"])
  const view = render(cards("shared", "broken", true))
  expect(mockFallbacks).not.toHaveBeenCalled()
  fireEvent(view.getByTestId("thumb"), "error", { nativeEvent: { error: "404" } })
  await waitFor(() => expect(view.getByTestId("thumb").props.source).toEqual([{ uri: "working" }]))
  expect(view.getByTestId("preview").props.source).toEqual([{ uri: "working" }])
  expect(mockFallbacks).toHaveBeenCalledTimes(1)
  view.unmount()
  const reopened = render(cards("shared", "broken"))
  expect(reopened.getByTestId("thumb").props.source).toEqual([{ uri: "working" }])
  expect(mockFallbacks).toHaveBeenCalledTimes(1)
})

it("tries the next candidate and preserves image dimensions when all fail", async () => {
  mockFallbacks.mockResolvedValue(["also-broken", "last"])
  const view = render(cards("exhausted", "broken"))
  fireEvent(view.getByTestId("thumb"), "error", { nativeEvent: { error: "404" } })
  await waitFor(() =>
    expect(view.getByTestId("thumb").props.source).toEqual([{ uri: "also-broken" }]),
  )
  fireEvent(view.getByTestId("thumb"), "error", { nativeEvent: { error: "404" } })
  expect(view.getByTestId("thumb").props.source).toEqual([{ uri: "last" }])
  fireEvent(view.getByTestId("thumb"), "error", { nativeEvent: { error: "404" } })
  expect(view.getByText("No image found")).toBeTruthy()
  expect(view.getByTestId("thumb-placeholder")).toHaveStyle(style)
  expect(mockFallbacks).toHaveBeenCalledTimes(1)
})

it("looks up absent images and handles unavailable providers without changing cards", async () => {
  let finish: ((urls: string[]) => void) | undefined
  mockFallbacks.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const view = render(cards("old"))
  view.rerender(cards("new", "new-image"))
  await act(async () => finish?.(["old-image"]))
  expect(view.getByTestId("thumb").props.source).toEqual([{ uri: "new-image" }])
  mockFallbacks.mockRejectedValueOnce(new Error("offline"))
  fireEvent(view.getByTestId("thumb"), "error", { nativeEvent: { error: "404" } })
  await waitFor(() => expect(view.getByText("No image found")).toBeTruthy())
})

it("stops loading while offline without duplicating the still-running action", async () => {
  jest.useFakeTimers()
  try {
    let finish: ((urls: string[]) => void) | undefined
    mockFallbacks.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const view = render(cards("offline"))
    expect(view.getByText("Loading…")).toBeTruthy()
    act(() => jest.advanceTimersByTime(15_000))
    expect(view.getByText("No image found")).toBeTruthy()
    view.unmount()
    act(() => jest.advanceTimersByTime(30_001))
    const reopened = render(cards("offline"))
    expect(mockFallbacks).toHaveBeenCalledTimes(1)
    await act(async () => finish?.(["recovered"]))
    expect(reopened.getByTestId("thumb").props.source).toEqual([{ uri: "recovered" }])
  } finally {
    jest.useRealTimers()
  }
})

it("limits a deck's missing-image lookups to two concurrent actions", async () => {
  const pending: Array<(result: string[] | Error) => void> = []
  let active = 0
  let peak = 0
  mockFallbacks.mockImplementation(() => {
    active += 1
    peak = Math.max(peak, active)
    return new Promise<string[]>((resolve, reject) => {
      pending.push((result) => {
        active -= 1
        if (result instanceof Error) reject(result)
        else resolve(result)
      })
    })
  })
  const view = render(
    <ThemeProvider initialContext="dark">
      {Array.from({ length: 8 }, (_, index) => (
        <CardImage
          key={index}
          game="pokemon"
          cardId={`burst-${index}`}
          style={style}
          accessibilityLabel={`Card ${index}`}
        />
      ))}
    </ThemeProvider>,
  )
  await act(async () => {})
  const initialPeak = peak
  for (let i = 0; i < 8; i++) {
    await act(async () => pending.shift()?.(i === 0 ? new Error("Provider unavailable") : []))
  }
  expect(mockFallbacks).toHaveBeenCalledTimes(8)
  expect(view.getAllByText("No image found")).toHaveLength(8)
  expect(initialPeak).toBeLessThanOrEqual(2)
  expect(peak).toBeLessThanOrEqual(2)
})
