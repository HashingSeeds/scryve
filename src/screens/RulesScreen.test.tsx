import { fireEvent, render } from "@testing-library/react-native"

import type { ComprehensiveRules } from "@/features/rules/comprehensiveRules"
import { GAME_RULES } from "@/features/rules/gameRules"
import { ThemeProvider } from "@/theme/context"
import { captureAnalytics } from "@/utils/analytics"
import { storage } from "@/utils/storage"

import { RulesScreen } from "./RulesScreen"

const mockRules: ComprehensiveRules = {
  effectiveDate: "September 25, 2026",
  chapters: [
    {
      id: "5",
      title: "Turn Structure",
      sections: [
        {
          id: "509",
          title: "Declare Blockers Step",
          rules: [
            {
              id: "509.1",
              text: "First, the defending player declares blockers (see rule 733).",
              examples: [],
            },
            { id: "509.1a", text: "The defending player chooses blockers.", examples: [] },
            { id: "509.1b", text: "Check restrictions.", examples: [] },
            { id: "509.1c", text: "Check requirements.", examples: [] },
            { id: "509.1d", text: "Determine costs.", examples: [] },
          ],
        },
      ],
    },
    {
      id: "7",
      title: "Additional Rules",
      sections: [
        {
          id: "733",
          title: "Handling Illegal Actions",
          rules: [
            { id: "733.1", text: "The entire action is reversed.", examples: [] },
            { id: "733.2", text: "Blocking requirements are in 509.1d.", examples: [] },
          ],
        },
      ],
    },
  ],
  glossary: [],
  notice: [],
}

jest.mock("@/utils/analytics", () => ({
  ...jest.requireActual("@/utils/analytics"),
  captureAnalytics: jest.fn(),
}))
jest.mock("@/features/rules/rulesSource", () => ({
  useComprehensiveRules: () => ({ rules: mockRules, failed: false, retry: jest.fn() }),
}))
jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void) =>
    jest.requireActual<typeof import("react")>("react").useEffect(effect, [effect]),
}))

function renderRules(props: { ruleId?: string; onOpenRule?: (id: string) => void } = {}) {
  return render(
    <ThemeProvider initialContext="dark">
      <RulesScreen
        source={GAME_RULES.mtg}
        system="mtg"
        back={{ label: "Game", onPress: jest.fn() }}
        onOpenRule={props.onOpenRule ?? jest.fn()}
        ruleId={props.ruleId}
      />
    </ThemeProvider>,
  )
}

beforeEach(() => storage.clearAll())

it("opens a chapter in place to list its sections", () => {
  const view = renderRules()
  expect(view.queryByTestId("rules-section-509")).toBeNull()
  fireEvent.press(view.getByTestId("rules-chapter-5"))
  expect(view.getByTestId("rules-section-509")).toBeTruthy()
})

it("peeks at a referenced rule without leaving the section", () => {
  const onOpenRule = jest.fn()
  const view = renderRules({ ruleId: "509.1", onOpenRule })
  fireEvent.press(view.getByText("733"))
  expect(view.getByTestId("rule-peek-733")).toBeTruthy()
  expect(view.getByText("733.1 The entire action is reversed.")).toBeTruthy()
  expect(onOpenRule).not.toHaveBeenCalled()
  fireEvent.press(view.getByText("Open"))
  expect(onOpenRule).toHaveBeenCalledWith("733")
})

it("peeks from the referenced subrule, not the start of its group", () => {
  const view = renderRules({ ruleId: "733" })
  fireEvent.press(view.getByText("509.1d"))
  expect(view.getByText("509.1d Determine costs.")).toBeTruthy()
  expect(
    view.queryByText("509.1 First, the defending player declares blockers (see rule 733)."),
  ).toBeNull()
})

it("lists rules you opened under Recent", () => {
  renderRules({ ruleId: "509.1" }).unmount()
  const view = renderRules()
  expect(view.getByTestId("rules-recent-509.1")).toBeTruthy()
})

it("reports a search once, numbers each result opened from it, and keeps only a fruitless query", () => {
  const capture = jest.mocked(captureAnalytics)
  capture.mockClear()
  const view = renderRules()
  fireEvent.changeText(view.getByTestId("rules-search"), "Block")
  fireEvent.press(view.getByTestId("rule-509.1a"))
  fireEvent.press(view.getByTestId("rule-733.2"))
  fireEvent.changeText(view.getByTestId("rules-search"), "Banding")
  view.unmount()
  expect(capture.mock.calls).toEqual([
    [
      "rules_search",
      { system: "mtg", result_count: 3, top_results: "509.1,509.1a,733.2", query: "Block" },
    ],
    ["rules_opened", { system: "mtg", rank: 2, open_count: 1 }],
    ["rules_opened", { system: "mtg", rank: 3, open_count: 2 }],
    ["rules_search", { system: "mtg", result_count: 0, top_results: "", query: "Banding" }],
  ])
})
