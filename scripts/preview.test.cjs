const assert = require("node:assert/strict")
const { createHash } = require("node:crypto")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const { previewName, writeOverride } = require("./preview.cjs")

test("preview names stay stable and distinct across slash and hyphen branches", () => {
  const branch = "fix/preview-env"
  assert.equal(
    previewName(branch),
    `fix-preview-env-${createHash("sha256").update(branch).digest("hex").slice(0, 8)}`,
  )
  assert.notEqual(previewName(branch), previewName("fix-preview-env"))
  assert.match(previewName("x".repeat(100)), /^[a-z0-9-]{1,49}$/)
})

test("preview override stays local and preserves unrelated values", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scryve-preview-test-"))
  const file = path.join(directory, ".env.development.local")
  try {
    fs.writeFileSync(file, "CUSTOM=value\nEXPO_PUBLIC_CONVEX_URL=https://old.convex.cloud\n")
    writeOverride("https://fresh-otter.convex.cloud", "https://fresh-otter.convex.site", file)
    assert.equal(
      fs.readFileSync(file, "utf8"),
      "CUSTOM=value\nEXPO_PUBLIC_CONVEX_URL=https://fresh-otter.convex.cloud\nEXPO_PUBLIC_CONVEX_SITE_URL=https://fresh-otter.convex.site\nCONVEX_DEPLOYMENT=preview:fresh-otter\n",
    )
    const link = path.join(directory, "shared")
    fs.symlinkSync(file, link)
    assert.throws(
      () => writeOverride("https://other.convex.cloud", "https://other.convex.site", link),
      /Refusing to write through symlink/,
    )
    assert.throws(
      () => writeOverride("https://example.com", "https://example.com", file),
      /preview deployment URL/,
    )
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
