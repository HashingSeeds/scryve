import { recapExportSize } from "./GameRecap"

describe("recapExportSize", () => {
  it("exports 1080x1350 on any screen scale", () => {
    expect(recapExportSize("ios", 3)).toEqual({
      layout: { width: 360, height: 450 },
      request: { width: 360, height: 450 },
    })
    expect(recapExportSize("ios", 2).request).toEqual({ width: 540, height: 675 })
    expect(recapExportSize("android", 3)).toEqual({
      layout: { width: 360, height: 450 },
      request: { width: 1080, height: 1350 },
    })
    expect(recapExportSize("web", 2)).toEqual({
      layout: { width: 1080, height: 1350 },
      request: { width: 1080, height: 1350 },
    })
  })
})
