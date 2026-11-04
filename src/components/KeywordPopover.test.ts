import { popoverScroll } from "./KeywordPopover"

describe("popoverScroll", () => {
  it("leaves a popover that already fits alone", () => {
    expect(popoverScroll({ top: 300, height: 120, scrolled: 0, visible: 600 })).toBeUndefined()
  })

  it("scrolls down just enough to show a popover below the fold", () => {
    expect(popoverScroll({ top: 500, height: 200, scrolled: 0, visible: 600 })).toBe(116)
  })

  it("keeps the tapped word on screen when the popover is taller than the view", () => {
    expect(popoverScroll({ top: 500, height: 900, scrolled: 0, visible: 600 })).toBe(468)
  })

  it("scrolls back up when collapsing leaves the popover above the view", () => {
    expect(popoverScroll({ top: 500, height: 120, scrolled: 900, visible: 600 })).toBe(468)
  })
})
