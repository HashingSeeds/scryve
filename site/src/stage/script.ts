// A demo's timed steps on one board. A run goes from `start()` to `end()`. While it runs, the
// visitor's own tap on the board halts every step still to come, before the tap itself lands,
// so the board is theirs from wherever the demo got to. `onHalt` tidies up what the run leaves.
export function createDemoScript(board: HTMLElement, { onHalt }: { onHalt?: () => void } = {}) {
  const timers = new Set<number>()
  let running = false

  function cancel() {
    running = false
    timers.forEach((id) => window.clearTimeout(id))
    timers.clear()
    // The hand fades on its own and a press would have let go, so leftovers are simply dropped.
    board.querySelectorAll(".tap-hint").forEach((hint) => hint.remove())
    board.querySelectorAll(".pressed").forEach((el) => el.classList.remove("pressed"))
  }

  board.addEventListener(
    "click",
    (event) => {
      if (!event.isTrusted || !running) return
      cancel()
      onHalt?.()
    },
    true,
  )

  return {
    later(ms: number, run: () => void) {
      const id = window.setTimeout(() => {
        timers.delete(id)
        run()
      }, ms)
      timers.add(id)
    },
    // Begins a run, dropping whatever the last one still had pending.
    start() {
      cancel()
      running = true
    },
    // The run's last step has played; anything after it only tidies up, so a tap leaves it be.
    end() {
      running = false
    },
    cancel,
  }
}
