import { render } from "@testing-library/react-native"

import { colors } from "@/theme/colorsDark"
import { ThemeProvider } from "@/theme/context"

import { DeviceGlyph } from "./DeviceGlyph"

it("uses the dim theme color at thirteen pixels without an extra accessibility stop", () => {
  const view = render(
    <ThemeProvider initialContext="dark">
      <DeviceGlyph />
    </ThemeProvider>,
  )
  expect(view.getByTestId("device-glyph")).toHaveProp("width", 13)
  expect(view.getByTestId("device-glyph")).toHaveProp("height", 13)
  expect(view.getByTestId("device-glyph")).toHaveProp("stroke", colors.textDim)
  expect(view.getByTestId("device-glyph")).toHaveProp("accessible", false)
})
