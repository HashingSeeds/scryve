import { readFileSync } from "node:fs"
import { join } from "node:path"

import { lifeControlTestId } from "@/components/LifeControls"

describe("shipping Maestro selectors", () => {
  it("targets Home and stable seat-based controls mounted by the Expo Router app", () => {
    const recovery = readFileSync(
      join(process.cwd(), ".maestro/flows/Phase4LocalRecovery.yaml"),
      "utf8",
    )
    const localSmoke = readFileSync(join(process.cwd(), ".maestro/flows/Landing.yaml"), "utf8")

    expect(recovery).toContain('id: "new-game-button"')
    expect(recovery).toContain(`id: "${lifeControlTestId(1, 1)}"`)
    expect(localSmoke).toContain(`id: "${lifeControlTestId(1, -5)}"`)
    expect(recovery).not.toContain("quick-local-game-button")
  })
})
