const assert = require("node:assert/strict")
const { test } = require("node:test")

const { citedRequests } = require("./feedback-link.cjs")

test("an issue cites each feedback request id in its body once", () => {
  const body = [
    "A beta player reported this. Feedback request `rd75dqhat2bc0ckh59j6g7gs8d8jj8k1`.",
    "Fixed by #1072 (commit 120e7222ab6b2b4b5f0d3c8e3fb9a4d8c1e0f2a3).",
    "Feedback: rd75dqhat2bc0ckh59j6g7gs8d8jj8k1",
  ].join("\n")
  assert.deepEqual(citedRequests(body), ["rd75dqhat2bc0ckh59j6g7gs8d8jj8k1"])
  assert.deepEqual(citedRequests(null), [])
})
