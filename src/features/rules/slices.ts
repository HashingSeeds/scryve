// why: rules work yields between small steps so the same code can run at once (a search needs it now) or a few ms per frame (a board prepares it without dropping frames).
export type Sliced<T> = Generator<void, T>

export function finish<T>(job: Sliced<T>): T {
  let step = job.next()
  while (!step.done) step = job.next()
  return step.value
}

// why: each slice starts on a frame, so a step up to most of a frame long still lands before the next one.
export function runInSlices<T>(job: Sliced<T>, sliceMs = 6) {
  return new Promise<T>((resolve, reject) => {
    const slice = () => {
      try {
        const end = performance.now() + sliceMs
        do {
          const step = job.next()
          if (step.done) return resolve(step.value)
        } while (performance.now() < end)
        requestAnimationFrame(slice)
      } catch (error) {
        reject(error)
      }
    }
    requestAnimationFrame(slice)
  })
}

// why: splitting a whole rules text at once takes a phone over 40 ms, so this splits and trims one line per step. Trimming also drops a leading byte order mark.
export function* trimmedLines(text: string): Sliced<string[]> {
  const lines: string[] = []
  let start = 0
  for (const match of text.matchAll(/\r?\n|\u2028/g)) {
    lines.push(text.slice(start, match.index).trim())
    start = match.index + match[0].length
    yield
  }
  lines.push(text.slice(start).trim())
  return lines
}
