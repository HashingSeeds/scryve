import { Component, Fragment, type ReactNode } from "react"

const AUTO_RETRY_DELAYS_MS = [500, 2000]

interface ConvexQueryBoundaryProps {
  children: ReactNode
  resetKey?: string
  fallback: (failure: { error: Error; retry: () => void }) => ReactNode
}

interface ConvexQueryBoundaryState {
  error?: Error
  resetKey?: string
  attempt: number
}

export class ConvexQueryBoundary extends Component<
  ConvexQueryBoundaryProps,
  ConvexQueryBoundaryState
> {
  state: ConvexQueryBoundaryState = { resetKey: this.props.resetKey, attempt: 0 }

  private autoRetryTimer?: ReturnType<typeof setTimeout>
  private autoRetryCount = 0

  static getDerivedStateFromError(error: Error): Partial<ConvexQueryBoundaryState> {
    return { error }
  }

  static getDerivedStateFromProps(
    props: ConvexQueryBoundaryProps,
    state: ConvexQueryBoundaryState,
  ): Partial<ConvexQueryBoundaryState> | null {
    if (props.resetKey === state.resetKey) return null
    return { error: undefined, resetKey: props.resetKey, attempt: state.attempt + 1 }
  }

  componentDidUpdate(
    prevProps: ConvexQueryBoundaryProps,
    prevState: ConvexQueryBoundaryState,
  ): void {
    if (prevProps.resetKey !== this.props.resetKey) {
      this.clearAutoRetryTimer()
      this.autoRetryCount = 0
    }
    if (this.state.error && this.autoRetryTimer === undefined) {
      this.scheduleAutoRetry()
    } else if (!this.state.error && prevState.error) {
      this.autoRetryCount = 0
    }
  }

  componentWillUnmount(): void {
    this.clearAutoRetryTimer()
  }

  private clearAutoRetryTimer(): void {
    if (this.autoRetryTimer === undefined) return
    clearTimeout(this.autoRetryTimer)
    this.autoRetryTimer = undefined
  }

  private scheduleAutoRetry(): void {
    this.clearAutoRetryTimer()
    if (this.autoRetryCount >= AUTO_RETRY_DELAYS_MS.length) return
    const delay = AUTO_RETRY_DELAYS_MS[this.autoRetryCount]
    this.autoRetryCount += 1
    this.autoRetryTimer = setTimeout(() => {
      this.autoRetryTimer = undefined
      this.mountFreshChildren()
    }, delay)
  }

  private mountFreshChildren(): void {
    this.setState((state) => ({ error: undefined, attempt: state.attempt + 1 }))
  }

  private retry = (): void => {
    this.clearAutoRetryTimer()
    this.autoRetryCount = 0
    this.mountFreshChildren()
  }

  render(): ReactNode {
    if (!this.state.error) {
      return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>
    }
    return this.props.fallback({ error: this.state.error, retry: this.retry })
  }
}
