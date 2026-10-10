/**
 * why: scripted web runs that try to force known bad deck-editing states (races, caps, two tabs,
 * offline), so a branch can be checked against main with the same steps every time. Runs only
 * against a local dev server wired to development Clerk and a non-production Convex deployment,
 * and signs in through the real consent and Clerk flows with a *+clerk_test@sow.care account.
 */
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { parseArgs } = require("node:util")

const USAGE = `Scripted deck scenarios for the Scryve web app (dev Clerk + dev Convex only).

  node .claude/skills/test-scryve-web/scripts/scenarios.cjs <scenario...|all> --url http://localhost:8095

Scenarios (each makes its own "Scenario scratch" deck and deletes it after)
  burst-add      3 "+ Add" taps in one frame on a 299-entry deck: stops at 300, save sticks
  copy-cap       3 "+" taps in one frame at 998 copies: stops at 999, then "−" still works
  import-race    Add deck import editor: 3 adds, then 3 "+" taps, each in one frame; none lost
  remove-undo    remove the last copy and undo 6 times fast, then remove; save and reload hold
  two-tab-edit   tab B saves while tab A holds an unsaved edit; A's edit is kept or flagged
  offline-edit   edit + save offline, reload with Convex unreachable, reconnect; sync settles
  reseed-add     open a deck from cache, edit, reconnect, add from search at once; nothing lost
  cleanup        delete leftover "Scenario scratch" decks (not part of all)

Options
  --url <origin>         local dev server origin (required)
  --label <name>         names the artifacts folder, e.g. main or pr361 (default: the port)
  --email <address>      test identity with a free deck slot (default john+clerk_test@sow.care)
  --artifacts <dir>      default /tmp/scryve-scenarios
  --headed               show the browser

Sign-in state is kept in <artifacts>/auth so later runs skip the OTP. Prints one PASS/FAIL line
per scenario and exits 1 when any fails.
`

const OTP = "424242"
const PRODUCTION_DEPLOYMENT = "dashing-curlew-34"
const SCRATCH = "Scenario scratch"
// Not app failures: Reactotron (not running), RevenueCat events (blocked by local DNS), and React
// DOM-prop and nested-button warnings that main already prints on every deck screen.
const IGNORED_CONSOLE = [
  /localhost:9090/,
  /e\.revenue\.cat/,
  /non-boolean attribute/,
  /React does not recognize the/,
  /cannot be a descendant of|cannot contain a nested/,
]
const SAVE_STATUS =
  /^(Unsaved changes|Synced|Saved|Saved on device|Saved locally · Pending sync|Local edit not synced|Sync paused\..*)$/

function loadPlaywright() {
  try {
    return require("playwright")
  } catch {}
  // No repo dependency: reuse a Playwright that `npx playwright` already cached.
  const npx = path.join(os.homedir(), ".npm", "_npx")
  for (const dir of fs.existsSync(npx) ? fs.readdirSync(npx) : []) {
    const candidate = path.join(npx, dir, "node_modules", "playwright")
    if (fs.existsSync(candidate)) return require(candidate)
  }
  throw new Error(
    "Playwright not found. Run `npx -y playwright@1.62.1 --version` once, then retry.",
  )
}

function parseCli(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      url: { type: "string" },
      label: { type: "string" },
      email: { type: "string", default: "john+clerk_test@sow.care" },
      artifacts: { type: "string", default: "/tmp/scryve-scenarios" },
      headed: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  })
  if (values.help || positionals.length === 0) return { help: true }
  if (!values.url) throw new Error("--url is required, e.g. --url http://localhost:8095")
  const origin = new URL(values.url)
  if (!["localhost", "127.0.0.1"].includes(origin.hostname))
    throw new Error("Scenarios only run against a local dev server")
  if (!/^[a-z0-9._%-]+\+clerk_test@sow\.care$/i.test(values.email))
    throw new Error("--email must be a *+clerk_test@sow.care test account")
  const names = positionals.includes("all")
    ? Object.keys(SCENARIOS).filter((name) => name !== "cleanup")
    : positionals
  for (const name of names) if (!SCENARIOS[name]) throw new Error(`Unknown scenario: ${name}`)
  return {
    names,
    url: origin.origin,
    email: values.email,
    headed: values.headed,
    label: values.label ?? origin.port,
    artifacts: values.artifacts,
  }
}

/** A failed expectation; the scenario stops and reports the message. */
class Failure extends Error {}

function expect(condition, message) {
  if (!condition) throw new Failure(message)
}

// ---------------------------------------------------------------- identity

/** A browser context for the test identity, signed in through the real consent and Clerk flows. */
async function signedInContext(run) {
  const { browser, cli } = run
  const statePath = path.join(cli.artifacts, "auth", `${cli.email}@${new URL(cli.url).port}.json`)
  fs.mkdirSync(path.dirname(statePath), { recursive: true })
  const context = await browser.newContext({
    viewport: { width: 430, height: 900 },
    ...(fs.existsSync(statePath) ? { storageState: statePath } : {}),
  })
  const page = await newPage(run, context)
  await page.goto(`${cli.url}/account`)
  await acceptLegal(page)
  if (!(await signedInAs(page, cli.email))) {
    await signIn(page, cli.email)
    await page.goto(`${cli.url}/account`)
    await acceptLegal(page)
    expect(await signedInAs(page, cli.email), `Not signed in as ${cli.email} after a reload`)
  }
  await context.storageState({ path: statePath })
  return { context, page }
}

/** A tab that records console errors and refuses to talk to production Convex. */
async function newPage(run, context) {
  const page = await context.newPage()
  page.on("websocket", (socket) => {
    if (socket.url().includes(PRODUCTION_DEPLOYMENT)) {
      run.consoleErrors.push(`STOP: page opened a socket to production (${PRODUCTION_DEPLOYMENT})`)
      void page.close()
    }
  })
  page.on("console", (message) => {
    if (message.type() !== "error" || run.quiet) return
    const text = `${message.text()} ${message.location().url ?? ""}`
    run.consoleLog.push(text)
    if (!IGNORED_CONSOLE.some((pattern) => pattern.test(text)))
      run.consoleErrors.push(text.slice(0, 200))
  })
  page.on("pageerror", (error) => run.consoleErrors.push(`pageerror: ${error.message}`))
  return page
}

async function acceptLegal(page) {
  await page.waitForLoadState("networkidle").catch(() => {})
  const agree = page.getByTestId("accept-legal-button")
  if (await agree.isVisible().catch(() => false)) {
    await agree.click()
    await agree.waitFor({ state: "hidden", timeout: 15_000 })
  }
}

/** True when the account page shows this test identity; fails on any other signed-in account. */
async function signedInAs(page, email) {
  const account = page.getByText(/\S+@\S+\.\S+/).first()
  const signIn = page.getByRole("button", { name: "Re-authenticate" })
  await account.or(signIn).first().waitFor({ timeout: 30_000 })
  if (await signIn.isVisible()) return false
  const shown = (await account.textContent()) ?? ""
  expect(
    shown.toLowerCase().includes(email.toLowerCase()),
    `A different account is signed in: ${shown}`,
  )
  return true
}

/** Clerk's real development sign-in: email, then an emailed code (fixed OTP in test mode). */
async function signIn(page, email) {
  await page.getByRole("button", { name: "Re-authenticate" }).click()
  const dialog = page.getByRole("dialog")
  const emailField = dialog.getByRole("textbox", { name: "Email address or username" })
  await emailField.waitFor()
  expect(
    await dialog.getByText("Development mode").isVisible(),
    "Clerk is not the development instance",
  )
  await emailField.fill(email)
  await dialog.getByRole("button", { name: "Continue" }).click()
  const otherMethod = dialog.getByRole("link", { name: "Use another method" })
  const code = dialog.getByRole("textbox", { name: "Enter verification code" })
  await otherMethod.or(code).first().waitFor()
  if (!(await code.isVisible())) {
    // Accounts with a password open on the password step; the email code is one step away.
    await otherMethod.click()
    await Promise.all([
      page.waitForResponse((r) => /prepare_first_factor/.test(r.url()) && r.ok()),
      dialog.getByRole("button", { name: /email code/i }).click(),
    ])
  }
  await code.pressSequentially(OTP)
  await dialog.waitFor({ state: "hidden", timeout: 30_000 })
  await acceptLegal(page)
}

// ---------------------------------------------------------------- network

/**
 * Cuts the app off from Convex while the dev server stays reachable, so a tab can reload with no
 * backend. `context.setOffline` alone can't do that: the page itself would fail to load.
 */
async function convexSwitch(context) {
  const open = new Set()
  let blocked = false
  await context.routeWebSocket(/convex\.cloud/, (socket) => {
    if (blocked) return socket.close()
    socket.connectToServer()
    open.add(socket)
    socket.onClose(() => open.delete(socket))
  })
  return {
    block() {
      blocked = true
      for (const socket of open) socket.close()
    },
    unblock() {
      blocked = false
    },
  }
}

// ---------------------------------------------------------------- deck helpers

/** Real Magic card names (cached under the artifacts dir) for scratch deck lists. */
async function cardNames(run, count) {
  const cache = path.join(run.cli.artifacts, "card-names.json")
  if (fs.existsSync(cache)) {
    const names = JSON.parse(fs.readFileSync(cache, "utf8"))
    if (names.length >= count) return names.slice(0, count)
  }
  const query = encodeURIComponent("(set:m21 or set:m20) -t:basic")
  let url = `https://api.scryfall.com/cards/search?q=${query}&unique=cards&order=name`
  const names = []
  while (url && names.length < Math.max(count, 320)) {
    const response = await fetch(url, {
      headers: { "User-Agent": "scryve-scenarios/1.0", "Accept": "application/json" },
    })
    if (!response.ok) throw new Error(`Scryfall card names: HTTP ${response.status}`)
    const body = await response.json()
    names.push(...body.data.map((card) => card.name))
    url = body.has_more ? body.next_page : undefined
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  fs.writeFileSync(cache, JSON.stringify(names))
  return names.slice(0, count)
}

async function openDecks(page, url) {
  await page.goto(`${url}/connected/decks`)
  await page.getByRole("button", { name: "Add deck" }).waitFor({ timeout: 30_000 })
  await page
    .getByRole("progressbar", { name: "Loading decks" })
    .waitFor({ state: "hidden", timeout: 60_000 })
}

/**
 * Imports a scratch deck through Add deck > Import > Paste text and opens it. Registers a cleanup
 * that deletes it, so a failed scenario still leaves the account as it was.
 */
async function createScratchDeck(run, page, lines, format = "Constructed") {
  await openDecks(page, run.cli.url)
  const capacity = page.getByRole("button", { name: /\d+ of \d+ free decks used/ })
  if (await capacity.isVisible()) {
    const [used, limit] = ((await capacity.getAttribute("aria-label")) ?? "")
      .match(/\d+/g)
      .map(Number)
    expect(used < limit, `${run.cli.email} has no free deck slot (${used}/${limit}); run cleanup`)
  }
  const name = `${SCRATCH} ${run.scenario}`
  await page.getByRole("button", { name: "Add deck" }).click()
  await page.getByTestId("mode-picker-options-paste").click()
  await page.getByRole("button", { name: /^Format, / }).click()
  await page.getByRole("menuitem", { name: new RegExp(`^${format}`) }).click()
  await page.getByTestId("deck-name-input").fill(name)
  await page.getByRole("textbox", { name: "Deck list" }).fill(lines.join("\n"))
  await reviewImport(run, page)
  await dismissDevToasts(page)
  await page.getByTestId("save-import-button").click()
  await page.waitForURL(/\/connected\/decks\/(?!add)[^/?]+$/, { timeout: 60_000 })
  const deckId = page.url().split("/").pop()
  run.cleanups.push(() => deleteDeck(run, deckId))
  await openDeck(page, run.cli.url, deckId)
  return deckId
}

/**
 * Presses "Review deck list" until the review opens. Scryfall sometimes answers the dev
 * deployment with 429 ("Card resolution is temporarily unavailable"); that is upstream throttling,
 * so wait and retry, and drop only those console errors.
 */
async function reviewImport(run, page) {
  const review = page.getByTestId("pasted-deck-review")
  const throttled = page.getByText(/temporarily unavailable \(429\)/)
  for (let attempt = 1; ; attempt += 1) {
    await dismissDevToasts(page)
    await page.getByTestId("review-import-button").click()
    await review.or(throttled).first().waitFor({ timeout: 60_000 })
    if (await review.isVisible()) break
    expect(attempt < 4, "Scryfall kept rate-limiting card resolution (429)")
    await page.waitForTimeout(30_000)
  }
  const throttleError = /scryfall_unavailable|deckImports:resolvePasted/
  run.consoleErrors = run.consoleErrors.filter((error) => !throttleError.test(error))
}

async function deleteDeck(run, deckId) {
  const { page } = await signedInContext(run)
  // Open it from the list, as a user would, so delete has a screen to go back to.
  await openDecks(page, run.cli.url)
  await page.getByTestId(`deck-card-${deckId}`).click()
  await page.getByTestId("deck-settings-button").click({ timeout: 30_000 })
  await page.getByTestId("delete-deck-button").click()
  await page.getByTestId("delete-deck-confirm").click()
  await page.getByTestId("delete-deck-dialog").waitFor({ state: "hidden", timeout: 30_000 })
  await openDecks(page, run.cli.url)
  const gone = await page
    .getByTestId(`deck-card-${deckId}`)
    .waitFor({ state: "detached" })
    .then(
      () => true,
      () => false,
    )
  await page.context().close()
  if (!gone) throw new Error(`scratch deck ${deckId} is still listed after delete`)
}

async function openDeck(page, url, deckId) {
  if (!page.url().endsWith(deckId)) await page.goto(`${url}/connected/decks/${deckId}`)
  await page
    .getByTestId("deck-cards-list")
    .getByText(/ · \d+ cards?$/)
    .waitFor({ timeout: 60_000 })
}

/** The deck's total copies, read from the header ("Magic · Constructed · 300 cards"). */
async function totalCards(page) {
  const text = await page
    .getByTestId("deck-cards-list")
    .getByText(/ · \d+ cards?$/)
    .first()
    .textContent()
  return Number(/(\d+) cards?$/.exec(text ?? "")?.[1])
}

/** Copies of one card from its row label ("2× Sol Ring"); 0 when no row shows it. */
async function copies(page, name) {
  return page.evaluate((cardName) => {
    for (const element of document.querySelectorAll("[aria-label]")) {
      const match = /^(\d+)× (.+)$/.exec(element.getAttribute("aria-label"))
      if (match && match[2] === cardName) return Number(match[1])
    }
    return 0
  }, name)
}

async function saveStatus(page) {
  return (
    (await page
      .getByText(SAVE_STATUS)
      .first()
      .textContent()
      .catch(() => "")) ?? ""
  )
}

/** Waits up to `timeout` while the save status matches `busy`; returns the last status. */
async function waitForSettled(page, timeout = 30_000, busy = /Saving|Pending|not synced|paused/) {
  const end = Date.now() + timeout
  let status = await saveStatus(page)
  while (busy.test(status) && Date.now() < end) {
    await page.waitForTimeout(500)
    status = await saveStatus(page)
  }
  return status
}

/** Clicks every element with these accessibility labels in one synchronous task (one frame). */
async function burstClick(page, labels) {
  const clicked = await page.evaluate((wanted) => {
    let count = 0
    for (const label of wanted) {
      const element = [...document.querySelectorAll("[aria-label]")].find(
        (candidate) => candidate.getAttribute("aria-label") === label,
      )
      if (element) {
        element.click()
        count += 1
      }
    }
    return count
  }, labels)
  expect(clicked === labels.length, `burst found ${clicked}/${labels.length} targets: ${labels}`)
}

/**
 * Closes Expo's dev LogBox toasts ("! Received `false`..."), which sit over the bottom action bar.
 * A toast is a button holding its own close button, with a "!" or count badge first.
 */
async function dismissDevToasts(page) {
  const toasts = page
    .getByRole("button")
    .filter({ has: page.getByRole("button") })
    .filter({ hasText: /^(!|\d+)/ })
  for (const toast of await toasts.all())
    await toast
      .getByRole("button")
      .last()
      .click({ timeout: 2000 })
      .catch(() => {})
}

async function startEditing(page) {
  await dismissDevToasts(page)
  await page.getByTestId("edit-deck-button").click()
  await page.getByTestId("save-version-button").waitFor()
}

/** Saves and waits for the save to settle; returns the status it settled on. */
async function save(page, timeout = 30_000) {
  await dismissDevToasts(page)
  await page.getByTestId("save-version-button").click()
  await page
    .getByTestId("edit-deck-button")
    .waitFor({ timeout })
    .catch(() => {})
  // A rejected or conflicting save ends on "Local edit not synced", so only wait out in-flight states.
  return waitForSettled(page, timeout, /Unsaved|Saving|Pending/)
}

/** Opens card search, searches, and returns result names that are not in `exclude`. */
async function searchCards(page, opener, query, exclude = []) {
  await dismissDevToasts(page)
  await page.getByTestId(opener).click()
  await page.getByTestId("card-search-input").fill(query)
  const results = page.getByRole("button", { name: /^Add .+ to deck$/ })
  await results.first().waitFor({ timeout: 30_000 })
  await page.waitForTimeout(500)
  const labels = await results.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("aria-label")),
  )
  const skip = new Set(exclude)
  return labels.map((label) => label.slice(4, -8)).filter((name) => !skip.has(name))
}

async function closeSearch(page) {
  await page.getByRole("button", { name: "Done" }).last().click()
  await page.getByTestId("card-search-input").waitFor({ state: "hidden" })
}

async function shot(run, page, name) {
  await page.screenshot({ path: path.join(run.dir, `${run.scenario}-${name}.png`) })
}

// ---------------------------------------------------------------- scenarios

const SCENARIOS = {
  async "burst-add"(run) {
    const { page } = await signedInContext(run)
    const names = await cardNames(run, 299)
    const deckId = await createScratchDeck(
      run,
      page,
      names.map((name) => `1 ${name}`),
    )
    expect(
      (await totalCards(page)) === 299,
      `scratch deck has ${await totalCards(page)} cards, not 299`,
    )
    await startEditing(page)
    const fresh = (await searchCards(page, "deck-add-cards", "sliver", names)).slice(0, 3)
    expect(fresh.length === 3, `search found only ${fresh.length} cards outside the deck`)
    await burstClick(
      page,
      fresh.map((name) => `Add ${name} to deck`),
    )
    await page.waitForTimeout(500)
    const limitShown = await page.getByText("A deck can have at most 300 entries.").isVisible()
    await shot(run, page, "after-burst")
    await closeSearch(page)
    const afterBurst = await totalCards(page)
    const status = await save(page)
    await shot(run, page, "after-save")
    await page.reload()
    await openDeck(page, run.cli.url, deckId)
    const afterReload = await totalCards(page)
    await shot(run, page, "after-reload")
    const seen = `burst -> ${afterBurst}, save "${status}", reload -> ${afterReload}, limit message ${limitShown}`
    expect(afterBurst <= 300, `deck passed 300 entries: ${seen}`)
    expect(afterReload === afterBurst, `save was not kept: ${seen}`)
    return seen
  },

  async "copy-cap"(run) {
    const { page } = await signedInContext(run)
    const [capped, other] = await cardNames(run, 2)
    const deckId = await createScratchDeck(run, page, [`998 ${capped}`, `1 ${other}`])
    await startEditing(page)
    await burstClick(page, Array(3).fill(`Increase ${capped}`))
    await page.waitForTimeout(500)
    const atCap = await copies(page, capped)
    await searchCards(page, "deck-add-cards", capped)
    await burstClick(page, Array(3).fill(`Add ${capped} to deck`))
    await page.waitForTimeout(500)
    const searchMessage = await page
      .getByText(/at most 999 copies|Added /)
      .first()
      .textContent()
    await shot(run, page, "search-at-cap")
    await closeSearch(page)
    const afterSearch = await copies(page, capped)
    // Two steps down, so the draft differs from the saved 998 and Save is enabled.
    await page.getByRole("button", { name: `Decrease ${capped}` }).click()
    const afterDecrement = await copies(page, capped)
    await page.getByRole("button", { name: `Decrease ${capped}` }).click()
    const status = await save(page)
    await page.reload()
    await openDeck(page, run.cli.url, deckId)
    const afterReload = await copies(page, capped)
    await shot(run, page, "after-reload")
    const seen = `+x3 -> ${atCap}, search +x3 -> ${afterSearch} ("${searchMessage}"), − -> ${afterDecrement}, −, save "${status}", reload -> ${afterReload}`
    expect(atCap === 999 && afterSearch === 999, `copies did not stop at 999: ${seen}`)
    expect(afterDecrement === 998, `decrement at the cap did not work: ${seen}`)
    expect(afterReload === 997, `save was not kept: ${seen}`)
    return seen
  },

  async "import-race"(run) {
    const { page } = await signedInContext(run)
    const names = await cardNames(run, 3)
    await openDecks(page, run.cli.url)
    await page.getByRole("button", { name: "Add deck" }).click()
    await page.getByTestId("mode-picker-options-paste").click()
    await page
      .getByRole("textbox", { name: "Deck list" })
      .fill(names.map((n) => `1 ${n}`).join("\n"))
    await reviewImport(run, page)
    await page.getByRole("button", { name: "Edit", exact: true }).click()
    const fresh = (await searchCards(page, "import-add-cards", "sliver", names)).slice(0, 3)
    await burstClick(
      page,
      fresh.map((name) => `Add ${name} to deck`),
    )
    await page.waitForTimeout(500)
    await closeSearch(page)
    const added = await Promise.all(fresh.map((name) => copies(page, name)))
    await burstClick(
      page,
      names.map((name) => `Increase ${name}`),
    )
    await page.waitForTimeout(500)
    const increased = await Promise.all(names.map((name) => copies(page, name)))
    await shot(run, page, "editor")
    // Nothing is saved: the import editor is left without creating a deck.
    const seen = `adds ${fresh.map((n, i) => `${n}=${added[i]}`).join(", ")}; increases ${increased.join(", ")}`
    expect(
      added.every((count) => count === 1),
      `quick adds were lost: ${seen}`,
    )
    expect(
      increased.every((count) => count === 2),
      `quick quantity changes were lost: ${seen}`,
    )
    return seen
  },

  async "remove-undo"(run) {
    const { page } = await signedInContext(run)
    const names = await cardNames(run, 5)
    const deckId = await createScratchDeck(
      run,
      page,
      names.map((name) => `1 ${name}`),
    )
    const target = names[0]
    await startEditing(page)
    for (let cycle = 0; cycle < 6; cycle += 1) {
      await page.getByRole("button", { name: `Remove ${target}` }).click()
      await page.getByText("Undo", { exact: true }).click()
    }
    const afterUndo = `${await copies(page, target)}/${await totalCards(page)}`
    await page.getByRole("button", { name: `Remove ${target}` }).click()
    const afterRemove = `${await copies(page, target)}/${await totalCards(page)}`
    const status = await save(page)
    await page.reload()
    await openDeck(page, run.cli.url, deckId)
    const afterReload = `${await copies(page, target)}/${await totalCards(page)}`
    await shot(run, page, "after-reload")
    const seen = `copies/total after 6 undo ${afterUndo}, remove ${afterRemove}, save "${status}", reload ${afterReload}`
    expect(afterUndo === "1/5", `undo did not restore the card: ${seen}`)
    expect(afterRemove === "0/4" && afterReload === "0/4", `counts drifted: ${seen}`)
    return seen
  },

  async "two-tab-edit"(run) {
    const { context, page: tabA } = await signedInContext(run)
    const names = await cardNames(run, 5)
    const deckId = await createScratchDeck(
      run,
      tabA,
      names.map((name) => `1 ${name}`),
    )
    const tabB = await newPage(run, context)
    await openDeck(tabB, run.cli.url, deckId)
    await startEditing(tabA)
    await tabA.getByRole("button", { name: `Increase ${names[0]}` }).click()
    await startEditing(tabB)
    await tabB.getByRole("button", { name: `Increase ${names[1]}` }).click()
    const statusB = await save(tabB)
    await tabA.waitForTimeout(2000)
    const aHeld = `${await copies(tabA, names[0])}, "${await saveStatus(tabA)}"`
    await shot(run, tabA, "a-before-save")
    const statusA = await save(tabA)
    await shot(run, tabA, "a-after-save")
    // A conflict is fine when it is flagged: resolve it the way a user keeping their edit would.
    const review = tabA.getByRole("button", { name: "Review changes" })
    const flagged = await review.isVisible()
    let choice = ""
    if (flagged) {
      await review.click()
      choice = (await tabA.getByTestId("reapply-version-cards").textContent()) ?? ""
      await tabA.getByTestId("reapply-version-cards").click()
      await waitForSettled(tabA)
    }
    await Promise.all([tabA.reload(), tabB.reload()])
    await openDeck(tabA, run.cli.url, deckId)
    await openDeck(tabB, run.cli.url, deckId)
    await Promise.all([waitForSettled(tabA), waitForSettled(tabB)])
    const finalA = names.slice(0, 2).map((name) => copies(tabA, name))
    const finalB = names.slice(0, 2).map((name) => copies(tabB, name))
    const [a, b] = [await Promise.all(finalA), await Promise.all(finalB)]
    const statuses = [await saveStatus(tabA), await saveStatus(tabB)]
    await shot(run, tabA, "a-reload")
    await shot(run, tabB, "b-reload")
    const seen = `B saved "${statusB}"; A held ${aHeld}; A saved "${statusA}", flagged ${flagged}${flagged ? ` -> "${choice}"` : ""}; after reload A ${a} "${statuses[0]}", B ${b} "${statuses[1]}"`
    expect(a[0] === 2, `A's unsaved edit was lost: ${seen}`)
    expect(a.join() === b.join(), `tabs disagree after reload: ${seen}`)
    expect(
      statuses.every((status) => !/Saving|Pending|not synced|paused/.test(status)),
      `a tab never settled: ${seen}`,
    )
    return seen
  },

  async "offline-edit"(run) {
    const { context, page } = await signedInContext(run)
    const names = await cardNames(run, 5)
    const deckId = await createScratchDeck(
      run,
      page,
      names.map((name) => `1 ${name}`),
    )
    const convex = await convexSwitch(context)
    run.quiet = true // dropped sockets log errors while offline; those are expected
    await startEditing(page)
    await context.setOffline(true)
    await page.getByRole("button", { name: `Increase ${names[0]}` }).click()
    const offlineStatus = await save(page, 10_000)
    await shot(run, page, "offline-saved")
    convex.block()
    await context.setOffline(false)
    await page.reload()
    await openDeck(page, run.cli.url, deckId)
    const reloaded = `${await copies(page, names[0])}, "${await saveStatus(page)}"`
    await shot(run, page, "reloaded-without-convex")
    convex.unblock()
    run.quiet = false
    await page.reload()
    await openDeck(page, run.cli.url, deckId)
    const onlineStatus = await waitForSettled(page)
    const fresh = await signedInContext(run)
    await openDeck(fresh.page, run.cli.url, deckId)
    const server = await copies(fresh.page, names[0])
    await shot(run, fresh.page, "server-copy")
    const seen = `offline save "${offlineStatus}"; reload w/o Convex ${reloaded}; online "${onlineStatus}"; fresh tab ${server}`
    expect(reloaded.startsWith("2,"), `offline edit did not survive a reload: ${seen}`)
    expect(!/Pending|not synced|paused|Saving/.test(onlineStatus), `sync did not settle: ${seen}`)
    expect(server === 2, `edit did not reach the server: ${seen}`)
    return seen
  },

  async "reseed-add"(run) {
    const { context, page } = await signedInContext(run)
    const names = await cardNames(run, 5)
    const deckId = await createScratchDeck(
      run,
      page,
      names.map((name) => `1 ${name}`),
    )
    const convex = await convexSwitch(context)
    run.quiet = true
    convex.block()
    await page.reload()
    await openDeck(page, run.cli.url, deckId)
    await startEditing(page)
    await page.getByRole("button", { name: `Increase ${names[0]}` }).click()
    convex.unblock()
    run.quiet = false
    const fresh = (await searchCards(page, "deck-add-cards", "sliver", names)).slice(0, 1)
    await burstClick(page, [`Add ${fresh[0]} to deck`])
    await closeSearch(page)
    const beforeSave = `${await copies(page, names[0])}/${await totalCards(page)}`
    const status = await save(page)
    await page.reload()
    await openDeck(page, run.cli.url, deckId)
    const afterReload = `${await copies(page, names[0])}/${await totalCards(page)}`
    await shot(run, page, "after-reload")
    const seen = `copies/total before save ${beforeSave}, save "${status}", reload ${afterReload}`
    expect(afterReload === "2/7", `an edit was lost around the reconnect: ${seen}`)
    return seen
  },

  async "cleanup"(run) {
    const { page } = await signedInContext(run)
    await openDecks(page, run.cli.url)
    const ids = await page
      .locator('[data-testid^="deck-card-"]')
      .filter({ hasText: SCRATCH })
      .evaluateAll((rows) => rows.map((row) => row.dataset.testid.slice("deck-card-".length)))
    for (const id of ids) await deleteDeck(run, id)
    const count = ids.length
    return `deleted ${count} scratch deck(s)`
  },
}

// ---------------------------------------------------------------- runner

async function main() {
  const cli = parseCli(process.argv.slice(2))
  if (cli.help) return void process.stdout.write(USAGE)
  const { chromium } = loadPlaywright()
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const dir = path.join(cli.artifacts, `${cli.label}-${stamp}`)
  fs.mkdirSync(dir, { recursive: true })
  const browser = await chromium.launch({ headless: !cli.headed })
  let failed = 0
  for (const name of cli.names) {
    const run = {
      browser,
      cli,
      dir,
      scenario: name,
      consoleErrors: [],
      consoleLog: [],
      cleanups: [],
    }
    const started = Date.now()
    let verdict = "PASS"
    let detail = ""
    try {
      detail = (await SCENARIOS[name](run)) ?? ""
      if (run.consoleErrors.length)
        throw new Failure(`console errors: ${run.consoleErrors.join(" | ")}`)
    } catch (error) {
      verdict = "FAIL"
      detail =
        error instanceof Failure
          ? error.message
          : `error: ${error.message?.split("\n").slice(0, 4).join(" ").replace(/\s+/g, " ")}`
      for (const [index, page] of browser
        .contexts()
        .flatMap((c) => c.pages())
        .entries())
        await page
          .screenshot({ path: path.join(dir, `${name}-failed-${index}.png`) })
          .catch(() => {})
    } finally {
      for (const context of browser.contexts()) await context.close().catch(() => {})
      for (const cleanup of run.cleanups.reverse())
        await cleanup().catch((error) => {
          detail += ` (cleanup failed: ${error.message.split("\n")[0]})`
        })
      for (const context of browser.contexts()) await context.close().catch(() => {})
      if (run.consoleLog.length)
        fs.writeFileSync(path.join(dir, `${name}-console.txt`), run.consoleLog.join("\n"))
    }
    if (verdict === "FAIL") failed += 1
    const seconds = ((Date.now() - started) / 1000).toFixed(0)
    console.log(`${verdict} ${name} [${cli.label}] ${seconds}s ${detail}`.trim())
  }
  await browser.close()
  console.log(`artifacts: ${dir}`)
  process.exitCode = failed ? 1 : 0
}

main().catch((error) => {
  console.error(error.message ?? error)
  process.exitCode = 1
})
