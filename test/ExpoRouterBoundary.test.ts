import fs from "node:fs"
import path from "node:path"

const ROUTER_ROOT = path.join(process.cwd(), "src", "app")
const TEST_MODULE_PATTERN = /\.(?:spec|test)\.[cm]?[jt]sx?$/

function listFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name)
    return entry.isDirectory() ? listFiles(entryPath) : [entryPath]
  })
}

describe("Expo Router module boundary", () => {
  it("keeps Jest modules outside the shipping route root", () => {
    const testModules = listFiles(ROUTER_ROOT)
      .filter((file) => TEST_MODULE_PATTERN.test(file))
      .map((file) => path.relative(process.cwd(), file))

    expect(testModules).toEqual([])
  })
})
