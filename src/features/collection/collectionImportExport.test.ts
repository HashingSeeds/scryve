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
})
