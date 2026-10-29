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
    fireEvent.press(view.getByTestId("life-editor-step-1--5"))
    fireEvent.press(view.getByTestId("life-editor-close-seat-1"))
    fireEvent.press(view.getByTestId("game-menu-button"))
    rememberMountedIds()
    fireEvent.press(view.getByTestId("dice-d20"))
    rememberMountedIds()
    fireEvent.press(view.getByTestId("game-menu-button"))
    fireEvent.press(view.getByTestId("game-menu-button"))
    fireEvent.press(view.getByTestId("end-game-button"))
    rememberMountedIds()
    fireEvent.press(view.getByTestId("end-game-winner-0"))
    fireEvent.press(view.getByTestId("confirm-end-game-button"))
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
    const rememberSetupIds = () => {
      for (const node of setup.UNSAFE_root.findAll((node) => typeof node.props.testID === "string"))
        mountedIds.add(node.props.testID)
    }
    rememberSetupIds()
    fireEvent.press(setup.getByTestId("setup-change-button"))
    rememberSetupIds()
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
})
