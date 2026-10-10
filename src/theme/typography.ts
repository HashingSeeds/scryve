/** why: the files are named after their PostScript names so one fontFamily resolves on iOS and Android. */
const fonts = {
  rubik: {
    light: "Rubik-Light",
    normal: "Rubik-Regular",
    medium: "Rubik-Medium",
    semiBold: "Rubik-SemiBold",
    bold: "Rubik-Bold",
  },
}

/** why: only the web has no native binary carrying these fonts, so it loads them at runtime. */
export const webFontsToLoad = {
  [fonts.rubik.light]: require("../../assets/fonts/Rubik-Light.ttf"),
  [fonts.rubik.normal]: require("../../assets/fonts/Rubik-Regular.ttf"),
  [fonts.rubik.medium]: require("../../assets/fonts/Rubik-Medium.ttf"),
  [fonts.rubik.semiBold]: require("../../assets/fonts/Rubik-SemiBold.ttf"),
  [fonts.rubik.bold]: require("../../assets/fonts/Rubik-Bold.ttf"),
}

export const typography = {
  /**
   * The fonts are available to use, but prefer using the semantic name.
   */
  fonts,
  primary: fonts.rubik,
}
