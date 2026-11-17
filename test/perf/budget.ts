export function expectWithinBudget(
  measured: Readonly<Record<string, number>>,
  budget: Readonly<Record<string, number>>,
) {
  const keys = [...new Set([...Object.keys(measured), ...Object.keys(budget)])].sort()
  const over = Object.fromEntries(
    keys
      .filter((key) => (measured[key] ?? 0) > (budget[key] ?? 0))
      .map((key) => [key, `${measured[key]} > budget ${budget[key] ?? 0}`]),
  )
  const under = keys.filter((key) => (measured[key] ?? 0) < (budget[key] ?? 0))
  if (under.length > 0)
    console.warn(
      `Under budget, lower it to lock this in: ${under.map((key) => `${key} ${measured[key] ?? 0}`).join(", ")}`,
    )
  expect(over).toEqual({})
}
