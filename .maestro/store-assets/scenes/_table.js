// Asks goldie/maestro.ts's table server to act for the bots or the store account; see goldie/table.mjs.
const response = http.post(`${TABLE}/${ACTION}`, { body: "" })
if (response.status !== 200) throw new Error(`table ${ACTION} failed: ${response.body}`)
