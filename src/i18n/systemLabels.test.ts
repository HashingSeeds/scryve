import systems from "./en/systems"
import { SYSTEMS } from "../../convex/lib/systems/definitions"

const definitions = Object.entries(SYSTEMS)

describe("game system labels", () => {
  it("translates every counter and designation instead of showing its English label", () => {
    const items = definitions.flatMap(([system, { table }]) =>
      [...table.counters, ...table.designations].map(({ id }) => `${system}.${id}`),
    )
    const untranslated = items.filter(
      (item) => !Object.hasOwn(systems.tableItem, item.split(".")[1]),
    )

    expect(untranslated).toEqual([])
  })

  it("translates every deck section and format blurb", () => {
    const untranslated = definitions.flatMap(([system, { formats }]) =>
      formats.flatMap((format) => {
        const { id, sections } = format
        const blurb = "blurb" in format ? format.blurb : undefined
        return [
          ...sections
            .filter(
              (section) => section.id !== "main" && !Object.hasOwn(systems.section, section.id),
            )
            .map((section) => `${system}.${id} section ${section.id}`),
          ...(blurb &&
          !Object.hasOwn(systems.formatBlurb[system as keyof typeof systems.formatBlurb] ?? {}, id)
            ? [`${system}.${id} blurb`]
            : []),
        ]
      }),
    )

    expect(untranslated).toEqual([])
  })
})
