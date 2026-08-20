import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { lifeControlTestId } from "@/components/LifeControls"

describe("shipping Maestro selectors", () => {
  it("targets Home and stable seat-based controls mounted by the Expo Router app", () => {
    const recovery = readFileSync(
      join(process.cwd(), ".maestro/flows/LocalGameRecovery.yaml"),
      "utf8",
    )
    const localSmoke = readFileSync(join(process.cwd(), ".maestro/flows/Landing.yaml"), "utf8")

    expect(recovery).toContain('id: "new-game-button"')
    expect(recovery).toContain(`id: "${lifeControlTestId(1, 1)}"`)
    expect(localSmoke).toContain("longPressOn:")
    expect(localSmoke).toContain(`id: "${lifeControlTestId(1, -1)}"`)
    expect(recovery).not.toContain("quick-local-game-button")
  })

  it("keeps every flow app-id driven and isolated by the shared startup flow", () => {
    const flowDirectory = join(process.cwd(), ".maestro/flows")
    const flowNames = readdirSync(flowDirectory).filter((name) => name.endsWith(".yaml"))

    expect(flowNames.length).toBeGreaterThan(0)
    for (const flowName of flowNames) {
      const flow = readFileSync(join(flowDirectory, flowName), "utf8")
      expect(flow).toContain("appId: ${MAESTRO_APP_ID}")
      expect(flow).toMatch(/^tags: \[.+\]$/m)
      expect(flow).toContain("onFlowStart:")
      expect(flow).toContain("../shared/_OnFlowStart.yaml")
      expect(flow.match(/\.\.\/shared\/_OnFlowStart\.yaml/g)).toHaveLength(1)
    }
  })

  it("accepts the legal consent gate in the shared startup flow so cleared installs reach Home", () => {
    const shared = readFileSync(join(process.cwd(), ".maestro/shared/_OnFlowStart.yaml"), "utf8")

    expect(shared).toContain('visible: "Before you start"')
    expect(shared).toContain('id: "accept-legal-button"')
  })

  it("exposes selector validation, smoke, and full-suite package commands", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"))

    expect(packageJson.scripts["test:maestro:check"]).toContain("maestroSelectors.test.ts")
    expect(packageJson.scripts["test:maestro:smoke"]).toContain("--include-tags smoke")
    expect(packageJson.scripts["test:maestro"]).toContain(".maestro/flows")
    expect(packageJson.scripts.e2e).toBe("bash scripts/maestro-run.sh")
    expect(packageJson.scripts["capture:apple-review"]).toContain("CaptureAppleReview.yaml")
  })

  it("captures the live Scryve Pro paywall for Apple review", () => {
    const capture = readFileSync(
      join(process.cwd(), ".maestro/store-assets/CaptureAppleReview.yaml"),
      "utf8",
    )

    expect(capture).toContain('id: "account-button"')
    expect(capture).toContain('id: "count-pro-paywall-button"')
    expect(capture).toContain("takeScreenshot: screenshots/apple-review/count-pro-paywall")
  })
})
