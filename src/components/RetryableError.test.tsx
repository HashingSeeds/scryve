import { act, fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { RetryableError } from "./RetryableError"

function renderError(props: Partial<Parameters<typeof RetryableError>[0]> = {}) {
  const onRetry = jest.fn()
  const view = render(
    <ThemeProvider initialContext="light">
      <RetryableError message="Could not load" onRetry={onRetry} {...props} />
    </ThemeProvider>,
  )
  return { ...view, onRetry }
}

describe("RetryableError", () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it("retries manually without a delay", () => {
    const view = renderError({ testID: "retry" })
    const button = view.getByTestId("retry")
    expect(button).toBeEnabled()
    expect(view.getByText("Retry")).toBeTruthy()
    fireEvent.press(button)
    expect(view.onRetry).toHaveBeenCalledTimes(1)
  })

  it("counts down a delay and retries automatically", () => {
    const view = renderError({ retryAfterMs: 3000, testID: "retry" })
    expect(view.getByText("Retrying in 3s")).toBeTruthy()
    expect(view.getByTestId("retry")).toBeDisabled()
    act(() => {
      jest.advanceTimersByTime(1000)
    })
    expect(view.getByText("Retrying in 2s")).toBeTruthy()
    act(() => {
      jest.advanceTimersByTime(2000)
    })
    expect(view.onRetry).toHaveBeenCalledTimes(1)
  })
})
