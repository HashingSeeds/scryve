import fs from "node:fs"
import path from "node:path"

describe("EAS release profile isolation", () => {
  it("maps each release tier to its own environment and update channel", () => {
    const eas = JSON.parse(fs.readFileSync(path.join(process.cwd(), "eas.json"), "utf8"))
    expect(eas.build.development).toMatchObject({
      environment: "development",
      channel: "development",
      autoIncrement: false,
    })
    expect(eas.build.preview).toMatchObject({
      environment: "preview",
      channel: "preview",
      autoIncrement: false,
    })
    expect(eas.build.production).toMatchObject({
      environment: "production",
      channel: "production",
      autoIncrement: true,
    })
    expect(
      new Set([
        eas.build.development.channel,
        eas.build.preview.channel,
        eas.build.production.channel,
      ]).size,
    ).toBe(3)
    const app = JSON.parse(fs.readFileSync(path.join(process.cwd(), "app.json"), "utf8"))
    expect(app.runtimeVersion).toEqual({ policy: "appVersion" })
  })
})
