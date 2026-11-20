const assert = require("node:assert/strict")
const { test } = require("node:test")

const { citedRequests } = require("./feedback-link.cjs")

test("an issue cites each request id in its own text once, never in quoted player text", () => {
  const body = [
    "A beta player reported this. Feedback request `rd75dqhat2bc0ckh59j6g7gs8d8jj8k1`.",
    "Fixed by #1072 (commit 120e7222ab6b2b4b5f0d3c8e3fb9a4d8c1e0f2a3).",
    "> Player wrote: see n979ckm8j48wk2w5qc7gvq31y58jjqk8",
    "Feedback: rd75dqhat2bc0ckh59j6g7gs8d8jj8k1",
  ].join("\n")
  assert.deepEqual(citedRequests(body), ["rd75dqhat2bc0ckh59j6g7gs8d8jj8k1"])
  assert.deepEqual(citedRequests(null), [])
})
