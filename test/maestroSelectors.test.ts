import { createElement } from "react"
import { fireEvent, render } from "@testing-library/react-native"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { DEFAULT_LOCAL_SETTINGS, localGameRepository } from "@/features/game/localPersistence"
import { NewGameScreen } from "@/screens/NewGameScreen"
import { ThemeProvider } from "@/theme/context"

import Index from "../src/app/index"

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({}),
  useFocusEffect: jest.fn(),
  Redirect: () => null,
}))
jest.mock("@/features/auth/AuthContext", () => ({
  useAuthAccess: () => ({ isSignedIn: false, openAuth: jest.fn() }),
}))

describe("shipping Maestro selectors", () => {
  it("uses selectors mounted by the shipping board, its dialogs, and game setup", () => {
    localGameRepository.clearActiveGame()
    localGameRepository.saveSettings(DEFAULT_LOCAL_SETTINGS)
    const mountedIds = new Set<string>()
    const view = render(createElement(ThemeProvider, {}, createElement(Index)))
    const rememberMountedIds = () => {
      for (const node of view.UNSAFE_root.findAll((node) => typeof node.props.testID === "string"))
        mountedIds.add(node.props.testID)
    }
    rememberMountedIds()
    fireEvent.press(view.getByTestId("game-menu-button"))
    rememberMountedIds()
    fireEvent.press(view.getByTestId("utility-menu-button"))
    rememberMountedIds()
    fireEvent.press(view.getByTestId("utility-menu-backdrop"))
    fireEvent.press(view.getByTestId("game-menu-button"))
    fireEvent(view.getByTestId("life-seat-1--1"), "longPress")
    rememberMountedIds()
    fireEvent.changeText(view.getByTestId("life-editor-input-seat-1"), "5")
    fireEvent.press(view.getByTestId("life-editor-apply-seat-1"))
    fireEvent.press(view.getByTestId("game-menu-button"))
    rememberMountedIds()
    fireEvent.press(view.getByTestId("undo-button"))
    fireEvent.press(view.getByTestId("game-menu-button"))
    fireEvent.press(view.getByTestId("end-game-button"))
    rememberMountedIds()
    view.unmount()

    const setup = render(
      createElement(
        ThemeProvider,
        {},
        createElement(NewGameScreen, {
          defaults: DEFAULT_LOCAL_SETTINGS,
          mode: "local",
          onModeChange: jest.fn(),
          onBack: jest.fn(),
          onStartLocal: jest.fn(),
        }),
      ),
    )
    for (const node of setup.UNSAFE_root.findAll((node) => typeof node.props.testID === "string"))
      mountedIds.add(node.props.testID)
    setup.unmount()

    localGameRepository.saveSettings({ ...DEFAULT_LOCAL_SETTINGS, defaultPlayerCount: 6 })
    localGameRepository.clearActiveGame()
    const sixPlayers = render(createElement(ThemeProvider, {}, createElement(Index)))
    for (const node of sixPlayers.UNSAFE_root.findAll(
      (node) => typeof node.props.testID === "string",
    ))
      mountedIds.add(node.props.testID)
    sixPlayers.unmount()
    localGameRepository.saveSettings(DEFAULT_LOCAL_SETTINGS)

    for (const flowName of readdirSync(join(process.cwd(), ".maestro/flows"))) {
      const flow = readFileSync(join(process.cwd(), ".maestro/flows", flowName), "utf8")
      for (const [, id] of flow.matchAll(/\bid: "([^"]+)"/g)) {
        expect({ flowName, id, mounted: mountedIds.has(id) }).toEqual({
          flowName,
          id,
          mounted: true,
        })
      }
    }
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

  it("accepts the legal consent gate in the shared startup flow so cleared installs reach Play", () => {
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

    expect(capture).toContain('id: "utility-account-button"')
    expect(capture).toContain('id: "count-pro-paywall-button"')
    expect(capture).toContain("takeScreenshot: screenshots/apple-review/count-pro-paywall")
  })
})
