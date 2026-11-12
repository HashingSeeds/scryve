async function launchIn(languageTag: string) {
  let launched: { i18n: (typeof import("."))["i18n"]; loaded: Set<string> } | undefined
  await jest.isolateModulesAsync(async () => {
    jest.doMock("expo-localization", () => ({
      getLocales: () => [{ languageTag, textDirection: "ltr" }],
    }))
    const { resources } = await import("./resources")
    const loaded = new Set<string>()
    for (const [language, load] of Object.entries(resources)) {
      jest.spyOn(resources, language as keyof typeof resources).mockImplementation(() => {
        loaded.add(language)
        return load()
      })
    }
    const { i18n } = await import(".")
    launched = { i18n, loaded }
  })
  if (!launched) throw new Error("i18n did not load")
  return launched
}

describe("i18n launch", () => {
  it("loads only the device language, with its copy ready before anything awaits", async () => {
    const { i18n, loaded } = await launchIn("es-MX")

    expect(i18n.t("play:summary.playerCount", { count: 4 })).toBe("4 jugadores")
    expect(loaded).toEqual(new Set(["es"]))
  })
})
