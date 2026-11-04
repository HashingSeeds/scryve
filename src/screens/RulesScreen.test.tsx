import { fireEvent, render } from "@testing-library/react-native"

import type { ComprehensiveRules } from "@/features/rules/comprehensiveRules"
import { GAME_RULES } from "@/features/rules/gameRules"
import { ThemeProvider } from "@/theme/context"
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
          rules: [{ id: "733.1", text: "The entire action is reversed.", examples: [] }],
        },
      ],
    },
  ],
  glossary: [],
  notice: [],
}

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

it("lists rules you opened under Recent", () => {
  renderRules({ ruleId: "509.1" }).unmount()
  const view = renderRules()
  expect(view.getByTestId("rules-recent-509.1")).toBeTruthy()
})
