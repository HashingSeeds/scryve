import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

describe("EAS release profile isolation", () => {
  it("pins the supported Node LTS runtime across local and cloud builds", () => {
    const expectedNodeVersion = "24.18.1"
    const eas = JSON.parse(fs.readFileSync(path.join(process.cwd(), "eas.json"), "utf8"))
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
    )
    const nvmVersion = fs.readFileSync(path.join(process.cwd(), ".nvmrc"), "utf8").trim()

    expect(nvmVersion).toBe(expectedNodeVersion)
    expect(packageJson.engines.node).toBe(expectedNodeVersion)
    expect(eas.build.production.node).toBe(expectedNodeVersion)
  })

  it("maps each release tier to its own environment and update channel", () => {
    const eas = JSON.parse(fs.readFileSync(path.join(process.cwd(), "eas.json"), "utf8"))
    expect(eas.build.development).toMatchObject({
      environment: "development",
      channel: "development",
      autoIncrement: false,
      env: { EXPO_NO_DOTENV: "1", APP_VARIANT: "development" },
    })
    expect(eas.build.preview).toMatchObject({
      environment: "preview",
      channel: "preview",
      autoIncrement: false,
      env: { EXPO_NO_DOTENV: "1", APP_VARIANT: "preview" },
    })
    expect(eas.build.production).toMatchObject({
      environment: "production",
      channel: "production",
      autoIncrement: true,
      env: { EXPO_NO_DOTENV: "1", APP_VARIANT: "production" },
    })
    for (const profile of ["development", "preview", "production"]) {
      expect(eas.build[profile].env).not.toHaveProperty("NODE_ENV")
    }
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

  it("keeps Expo configuration compatible with Node and Bun config loaders", () => {
    const app = JSON.parse(fs.readFileSync(path.join(process.cwd(), "app.json"), "utf8"))
    const dynamicConfig = fs.readFileSync(path.join(process.cwd(), "app.config.ts"), "utf8")

    expect(app).not.toHaveProperty("expo")
    expect(app.plugins).toContainEqual(
      expect.arrayContaining(["@sentry/react-native/expo", expect.any(Object)]),
    )
    expect(dynamicConfig).not.toContain("tsx/cjs")
  })

  it("evaluates the dynamic Expo config through Expo's Node CLI", () => {
    const result = spawnSync(
      process.execPath,
      [path.join(process.cwd(), "node_modules/expo/bin/cli"), "config", "--json"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, EXPO_NO_DOTENV: "1" },
      },
    )

    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" })
    expect(JSON.parse(result.stdout).extra.eas.projectId).toBe(
      "1e4ab9fb-230c-421d-a659-a4aaa4355d82",
    )
  })
})
