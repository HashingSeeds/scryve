import { inviteCardIsSideBySide, inviteQrSize } from "./InviteCard"

describe("invite QR sizing", () => {
  it("keeps the full-size code on tall phones", () => {
    expect(inviteQrSize(932)).toBe(184)
    expect(inviteQrSize(844)).toBe(169)
  })

  it("shrinks the code on short screens so the seat list stays reachable", () => {
    expect(inviteQrSize(667)).toBe(133)
    expect(inviteQrSize(844)).toBeLessThan(184)
  })

  it("never shrinks past a scannable floor", () => {
    expect(inviteQrSize(480)).toBe(120)
    expect(inviteQrSize(0)).toBe(120)
  })

  it("puts the code beside the QR only when the screen is too short to stack them", () => {
    expect(inviteCardIsSideBySide(667)).toBe(true)
    expect(inviteCardIsSideBySide(844)).toBe(false)
    expect(inviteCardIsSideBySide(932)).toBe(false)
  })
})
