import { remove } from "@/utils/storage"

import {
  pendingSeatClaims,
  rememberSeatClaim,
  setNearbyOwner,
  settleSeatClaim,
} from "./nearbyAccount"

const DAY = 24 * 60 * 60_000
const claim = (publicId: string, finishedAt = 1_000) => ({ publicId, token: "token", finishedAt })

beforeEach(() => remove("lan.seatClaims"))

it("keeps nothing for a signed-out guest", () => {
  setNearbyOwner(undefined)
  rememberSeatClaim(claim("game-1"))
  setNearbyOwner("guest")
  expect(pendingSeatClaims("guest", 1_000)).toEqual([])
})

it("keeps one claim per game for the account that played it, until it settles or expires", () => {
  setNearbyOwner("guest")
  rememberSeatClaim(claim("game-1"))
  rememberSeatClaim(claim("game-1"))
  rememberSeatClaim(claim("game-2", 2_000))

  expect(pendingSeatClaims("someone-else", 2_000)).toEqual([])
  expect(pendingSeatClaims("guest", 2_000).map(({ publicId }) => publicId)).toEqual([
    "game-1",
    "game-2",
  ])
  settleSeatClaim("game-1", 2_000)
  expect(pendingSeatClaims("guest", 2_000).map(({ publicId }) => publicId)).toEqual(["game-2"])
  expect(pendingSeatClaims("guest", 2_000 + 30 * DAY)).toEqual([])
})
