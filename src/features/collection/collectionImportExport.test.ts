import { catalogDb } from "@/storage/catalogDb"
import { localCardDb } from "@/storage/localDb"

import {
  exportCollectionCsv,
  importCollectionText,
  parseCollectionImport,
} from "./collectionImportExport"
import { listCollectionEntries } from "./collectionStore"

describe("collectionImportExport", () => {
  beforeEach(() => {
    localCardDb.clearAll()
    catalogDb.clearAll()
  })

  it("parses Moxfield/Archidekt CSV and plain deck lines and round-trips CSV export", () => {
    const csv = [
      "Count,Name,Edition,Collector Number,Condition,Language,Foil,Purchase Price,Notes",
      '2,"Sol Ring",CMM,410,Near Mint,en,foil,$4.50,"Commander staple"',
      '1,"Demonic Tutor",LEA,104,LP,en,,$120.00,',
    ].join("\n")

    const parsed = parseCollectionImport(csv)
    expect(parsed.skipped).toBe(0)
    expect(parsed.rows).toEqual([
      {
        quantity: 2,
        name: "Sol Ring",
        setCode: "cmm",
        collectorNumber: "410",
        finish: "foil",
        condition: "NM",
        language: "en",
        acquiredCents: 450,
        notes: "Commander staple",
      },
      {
        quantity: 1,
        name: "Demonic Tutor",
        setCode: "lea",
        collectorNumber: "104",
        finish: "nonfoil",
        condition: "LP",
        language: "en",
        acquiredCents: 12000,
        notes: undefined,
      },
    ])

    catalogDb.replacePrintings(
      "mtg",
      [
        {
          game: "mtg",
          printingId: "scry-cmm-410",
          cardId: "ora-sol",
          name: "Sol Ring",
          nameNormalized: "sol ring",
          setCode: "cmm",
          setName: "Commander Masters",
          collectorNumber: "410",
          finishes: ["nonfoil", "foil"],
        },
      ],
      "v1",
    )

    const result = importCollectionText(csv, "mtg")
    expect(result).toEqual({ imported: 2, skipped: 0 })

    const entries = listCollectionEntries({ game: "mtg" })
    expect(entries).toHaveLength(2)
    expect(entries.find((e) => e.name === "Sol Ring")?.printingId).toBe("scry-cmm-410")

    const exported = exportCollectionCsv(entries)
    expect(exported).toContain("Count,Name,Edition,Collector Number")
    expect(exported).toContain("2,Sol Ring,CMM,410,NM,EN,foil,4.50,Commander staple")

    const plain = parseCollectionImport(
      "4 Lightning Bolt (FDN) 100 *F*\n// comment\n1 Rhystic Study [WOT] 25",
    )
    expect(plain.rows).toHaveLength(2)
    expect(plain.rows[0]).toMatchObject({
      quantity: 4,
      name: "Lightning Bolt",
      setCode: "fdn",
      collectorNumber: "100",
      finish: "foil",
    })
  })

  it("round-trips multiline notes, preserves unresolved explicit printings, and keeps distinct acquisition metadata separate", () => {
    catalogDb.replacePrintings(
      "mtg",
      [
        {
          game: "mtg",
          printingId: "scry-cmm-410",
          cardId: "ora-sol",
          name: "Sol Ring",
          nameNormalized: "sol ring",
          setCode: "cmm",
          setName: "Commander Masters",
          collectorNumber: "410",
          finishes: ["nonfoil"],
        },
      ],
      "v1",
    )

    const csv = [
      "Count,Name,Edition,Collector Number,Condition,Language,Foil,Purchase Price,Notes",
      '1,"Sol Ring",CMM,410,NM,en,,$2.00,"first line\n1,Sol Ring"',
      '1,"Sol Ring",CMM,410,NM,en,,$5.00,"signed"',
      '1,"Sol Ring",LEA,270,NM,en,,$400.00,',
    ].join("\n")

    const imported = importCollectionText(csv, "mtg")
    expect(imported).toEqual({ imported: 3, skipped: 0 })

    const entries = listCollectionEntries({ game: "mtg" })
    expect(entries).toHaveLength(3)

    const withMultilineNote = entries.find((e) => e.notes === "first line\n1,Sol Ring")
    expect(withMultilineNote?.acquiredCents).toBe(200)
    expect(withMultilineNote?.printingId).toBe("scry-cmm-410")

    const signed = entries.find((e) => e.notes === "signed")
    expect(signed?.acquiredCents).toBe(500)
    expect(signed?.printingId).toBe("scry-cmm-410")

    const unresolvedAlpha = entries.find((e) => e.setCode === "lea")
    expect(unresolvedAlpha).toMatchObject({
      name: "Sol Ring",
      setCode: "lea",
      collectorNumber: "270",
      printingId: "custom:sol ring:lea:270",
    })

    const exported = exportCollectionCsv(entries)
    localCardDb.clearAll()
    const reimported = importCollectionText(exported, "mtg")
    expect(reimported).toEqual({ imported: 3, skipped: 0 })
    const restored = listCollectionEntries({ game: "mtg" })
    expect(restored.find((e) => e.notes === "first line\n1,Sol Ring")).toBeTruthy()
  })
})
