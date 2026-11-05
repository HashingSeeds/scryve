import { act, fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { fittingSteps, mirroredSteps, StepChips } from "./StepChips"

const chips = (steps: number[], onStep = jest.fn()) =>
  render(
    <ThemeProvider initialContext="dark">
      <StepChips
        steps={steps}
        onStep={onStep}
        ink="#FFFFFF"
        testID="step"
        accessibilityLabel={(step) => `By ${step}`}
      />
    </ThemeProvider>,
  )

describe("StepChips", () => {
  it("mirrors step sizes around zero, largest at the edges, without repeats", () => {
    expect(mirroredSteps([10, 5, 1])).toEqual([-10, -5, -1, 1, 5, 10])
    expect(mirroredSteps([2, 1, 1])).toEqual([-2, -1, 1, 2])
  })

  it("applies each chip as a signed step", () => {
    const onStep = jest.fn()
    const view = chips([-5, 1], onStep)
    expect(view.getByText("−5")).toBeTruthy()
    expect(view.getByText("+1")).toBeTruthy()
    fireEvent.press(view.getByTestId("step--5"))
    fireEvent.press(view.getByRole("button", { name: "By 1" }))
    expect(onStep.mock.calls).toEqual([[-5], [1]])
  })

  it("drops the largest step sizes until every label fits its chip", () => {
    const steps = [-10, -5, 5, 10]
    const width = (step: number) => (Math.abs(step) >= 10 ? 22 : 16)
    expect(fittingSteps(steps, 200, width, 4)).toEqual(steps)
    expect(fittingSteps(steps, 80, width, 4)).toEqual([-5, 5])
    expect(fittingSteps(steps, 10, width, 4)).toEqual([-5, 5])
  })

  it("shows only the steps a measured row can fit", () => {
    const view = chips([-10, -5, -1, 1, 5, 10])
    const layout = (testID: string, width: number) =>
      act(() =>
        fireEvent(view.getByTestId(testID, { includeHiddenElements: true }), "layout", {
          nativeEvent: { layout: { width, height: 20, x: 0, y: 0 } },
        }),
      )
    for (const step of [-10, -5, -1, 1, 5, 10]) layout(`step-measure-${step}`, 20)
    expect(view.getByTestId("step-10")).toBeTruthy()

    layout("step", 100)
    expect(view.queryByTestId("step-10")).toBeNull()
    expect(view.getByTestId("step--5")).toBeTruthy()
    expect(view.getByTestId("step-1")).toBeTruthy()
  })
})
