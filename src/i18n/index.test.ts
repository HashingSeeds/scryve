import { resources } from "./resources"

async function launchIn(languageTag: string) {
  let launched: { i18n: (typeof import("."))["i18n"]; evaluated: Set<string> } | undefined
  await jest.isolateModulesAsync(async () => {
    jest.doMock("expo-localization", () => ({
      getLocales: () => [{ languageTag, textDirection: "ltr" }],
    }))
    const evaluated = new Set<string>()
    for (const language of Object.keys(resources)) {
      jest.doMock(`./${language}`, () => {
        evaluated.add(language)
        return jest.requireActual(`./${language}`)
      })
    }
    const { i18n } = await import(".")
    launched = { i18n, evaluated }
  })
  if (!launched) throw new Error("i18n did not load")
  return launched
}

describe("i18n launch", () => {
  it("evaluates only the device language, with its copy ready before anything awaits", async () => {
    const { i18n, evaluated } = await launchIn("es-MX")

    expect(i18n.t("play:summary.playerCount", { count: 4 })).toBe("4 jugadores")
    expect(evaluated).toEqual(new Set(["es"]))
  })
})
