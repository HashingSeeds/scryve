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

export const typography = {
  /**
   * The fonts are available to use, but prefer using the semantic name.
   */
  fonts,
  primary: fonts.rubik,
}
