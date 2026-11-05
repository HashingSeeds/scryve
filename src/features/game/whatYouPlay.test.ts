import { DEFAULT_LOCAL_SETTINGS } from "./localPersistence"
import { settingsForWhatYouPlay } from "./whatYouPlay"
import { NO_SYSTEM_SETTINGS } from "../../../test/fixtures/localSettings"

const asked = { ...DEFAULT_LOCAL_SETTINGS, askWhatYouPlay: true } as const

describe("settingsForWhatYouPlay", () => {
  it("starts Commander at four seats and 40 life", () => {
    expect(
      settingsForWhatYouPlay(asked, { id: "commander", system: "mtg", format: "commander" }),
    ).toEqual({
      ...DEFAULT_LOCAL_SETTINGS,
      defaultSystem: "mtg",
      defaultFormat: "commander",
      defaultPlayerCount: 4,
      defaultStartingLife: 40,
    })
  })

  it("starts other games head to head", () => {
    expect(
      settingsForWhatYouPlay(asked, {
        id: "pokemon-standard",
        system: "pokemon",
        format: "standard",
      }),
    ).toEqual({
      ...DEFAULT_LOCAL_SETTINGS,
      defaultSystem: "pokemon",
      defaultFormat: "standard",
      defaultPlayerCount: 2,
      defaultStartingLife: 6,
    })
  })

  it("clears the system for no system", () => {
    expect(settingsForWhatYouPlay(asked, { id: "none" })).toEqual(NO_SYSTEM_SETTINGS)
  })
})
