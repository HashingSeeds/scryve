const assert = require("node:assert/strict")
const { test } = require("node:test")

const { assertPreviewTarget, botIdentity, lobbyIdentifiers, parseCli } = require("./bots.cjs")

test("bots only run against the preview Convex returned, never production", () => {
  assert.doesNotThrow(() =>
    assertPreviewTarget({
      deploymentName: "marvelous-terrier-476",
      url: "https://marvelous-terrier-476.convex.cloud",
    }),
  )
  assert.throws(
    () =>
      assertPreviewTarget({
        deploymentName: "dashing-curlew-34",
        url: "https://dashing-curlew-34.convex.cloud",
      }),
    /production/,
  )
  assert.throws(
    () =>
      assertPreviewTarget({
        deploymentName: "marvelous-terrier-476",
        url: "https://dashing-curlew-34.convex.cloud",
      }),
    /production/,
  )
  assert.throws(
    () => assertPreviewTarget({ deploymentName: "a-b-1", url: "https://example.com" }),
    /preview deployment URL/,
  )
})

test("bot identities and lobby identifiers pass the server's validators", () => {
  const { inviteToken, publicId, manualCodeCandidates } = lobbyIdentifiers()
  assert.match(inviteToken, /^[A-Za-z0-9_-]{43,128}$/)
  assert.match(publicId, /^[A-Za-z0-9_-]{16,64}$/)
  for (const code of manualCodeCandidates) assert.match(code, /^[A-Z2-9]{6}$/)
  const host = botIdentity(0)
  const guest = botIdentity(5)
  assert.match(host.deviceId, /^[A-Za-z0-9_-]{8,128}$/)
  assert.doesNotMatch(host.identity.subject, /^user_/)
  assert.notEqual(host.identity.subject, guest.identity.subject)
  assert.notEqual(host.deviceId, guest.deviceId)
})

test("cli defaults follow the format and reject seats that cannot exist", () => {
  const commander = parseCli(["host"])
  assert.equal(commander.life, 40)
  assert.equal(commander.system, "mtg")
  assert.equal(commander.lifeEvery, 3000)
  assert.equal(commander.start, true)
  const open = parseCli(["host", "--format", "none", "--no-start", "--duration", "off"])
  assert.equal(open.system, "none")
  assert.equal(open.life, 20)
  assert.equal(open.start, false)
  assert.equal(open.duration, 0)
  assert.equal(parseCli(["join", "ab12cd", "--drop-every", "1.5s"]).code, "AB12CD")
  assert.equal(parseCli(["join", "ab12cd", "--drop-every", "1.5s"]).dropEvery, 1500)
  assert.throws(() => parseCli(["host", "--players", "3", "--fill", "3"]), /--fill/)
  assert.throws(() => parseCli(["join"]), /invite code/)
  assert.throws(() => parseCli(["host", "--life-every", "fast"]), /duration/)
})
