import { resources } from "./resources"

async function launchIn(languageTag: string, textDirection: "ltr" | "rtl" = "ltr") {
  let launched:
    | {
        i18n: (typeof import("."))["i18n"]
        appLocale: string
        isRTL: boolean
        evaluated: Set<string>
      }
    | undefined
  await jest.isolateModulesAsync(async () => {
    jest.doMock("expo-localization", () => ({
      getLocales: () => [{ languageTag, textDirection }],
    }))
    const evaluated = new Set<string>()
    for (const language of Object.keys(resources)) {
      const entry = language === "en" ? "./en" : `./${language}/language`
      jest.doMock(entry, () => {
        evaluated.add(language)
        return jest.requireActual(entry)
      })
    }
    const { i18n, appLocale, isRTL } = await import(".")
    launched = { i18n, appLocale, isRTL, evaluated }
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

  it("reads right to left only when the app's language does", async () => {
    expect((await launchIn("ar-EG")).isRTL).toBe(true)
    expect(await launchIn("he-IL", "rtl")).toMatchObject({ appLocale: "en-US", isRTL: false })
  })
})
