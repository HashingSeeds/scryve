import { inviteCardIsSideBySide, inviteQrSize } from "./InviteCard"

describe("invite QR sizing", () => {
  it.each([
    [932, 184],
    [844, 169],
    [667, 133],
    [480, 120],
    [0, 120],
  ])("sizes the code on a %i-tall screen to %i, never past a scannable floor", (height, size) => {
    expect(inviteQrSize(height)).toBe(size)
  })

  it("puts the code beside the QR only when the screen is too short to stack them", () => {
    expect(inviteCardIsSideBySide(667)).toBe(true)
    expect(inviteCardIsSideBySide(844)).toBe(false)
    expect(inviteCardIsSideBySide(932)).toBe(false)
  })
})
