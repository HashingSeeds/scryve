import { AccessibilityInfo } from "react-native"
import { render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { ConnectionBadge } from "./ConnectionBadge"

describe("ConnectionBadge", () => {
  it("exposes pending semantics and announces meaningful status changes once", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <ConnectionBadge status="connected" pendingCount={2} />
      </ThemeProvider>,
    )
    expect(view.getByLabelText("Connected, 2 changes pending")).toBeTruthy()
    expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled()

    view.rerender(
      <ThemeProvider initialContext="light">
        <ConnectionBadge status="offline" pendingCount={2} />
      </ThemeProvider>,
    )
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      "Offline, 2 changes pending",
    )
  })
})
