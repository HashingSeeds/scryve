import { DEFAULT_LOCAL_SETTINGS } from "./localPersistence"
import { settingsForWhatYouPlay } from "./whatYouPlay"

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

  it("keeps today's defaults for no system", () => {
    expect(settingsForWhatYouPlay(asked, { id: "none" })).toEqual(DEFAULT_LOCAL_SETTINGS)
  })
})
