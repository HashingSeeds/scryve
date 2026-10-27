import { gameContentNotices } from "./gameContentNotices"
import { SYSTEM_IDS, SYSTEMS } from "../../convex/lib/systems"

const FAN_CONTENT_POLICY_NOTICE =
  "Scryve is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC."

describe("required game notices", () => {
  it("gives Magic the Fan Content Policy text verbatim", () => {
    expect(SYSTEMS.mtg.integration.rights.requiredNotices).toEqual([FAN_CONTENT_POLICY_NOTICE])
  })

  const shipped = SYSTEM_IDS.filter((id) => SYSTEMS[id].release !== "alpha")

  it.each(shipped)("shows %s's required notices in the game content notices", (id) => {
    const notices = SYSTEMS[id].integration.rights.requiredNotices
    const paragraphs = gameContentNotices.sections.flatMap((section) =>
      section.blocks.map((block) => block.text),
    )
    expect(notices.length).toBeGreaterThan(0)
    expect(paragraphs).toEqual(expect.arrayContaining([...notices]))
  })
})
