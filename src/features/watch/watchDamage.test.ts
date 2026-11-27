import { incomingFor } from "./watchDamage"

const seat = (playerId: string) => ({ playerId })

describe("incomingFor", () => {
  it("splits one seat's partners and keeps each square to damage this tile took", () => {
    const [ada, kim, lee] = [[seat("ada")], [seat("kim")], [seat("lee")]]
    const totals = [
      { fromPlayerId: "kim", toPlayerId: "ada", total: 9 },
      { fromPlayerId: "kim", toPlayerId: "ada", commander: 1, total: 4 },
      { fromPlayerId: "lee", toPlayerId: "kim", total: 12 },
    ]
    expect(incomingFor([ada, kim, lee], ada, totals)).toEqual({
      incoming: { kim: 9, lee: 0 },
      split: { kim: [9, 4] },
    })
  })

  it("sums a team's heads and shows the harder-hitting opposing head, unsplit", () => {
    const us = [seat("ada"), seat("bo")]
    const them = [seat("kim"), seat("lee")]
    const totals = [
      { fromPlayerId: "kim", toPlayerId: "ada", total: 6 },
      { fromPlayerId: "lee", toPlayerId: "ada", total: 5 },
      { fromPlayerId: "lee", toPlayerId: "bo", total: 4 },
      { fromPlayerId: "lee", toPlayerId: "bo", commander: 1, total: 2 },
    ]
    expect(incomingFor([us, them], us, totals)).toEqual({ incoming: { kim: 9 }, split: {} })
  })
})
