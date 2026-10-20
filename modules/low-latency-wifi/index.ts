import { NativeModule, requireOptionalNativeModule } from "expo"

declare class LowLatencyWifi extends NativeModule {
  acquire(): void
  release(): void
}

/** why: null on iOS, web, Jest, and Android binaries built before the module existed. */
const native = requireOptionalNativeModule<LowLatencyWifi>("LowLatencyWifi")

// why: Android Wi-Fi power save holds packets for 100+ ms between beacons; this lock only works while the app is on screen.
export function holdLowLatencyWifi() {
  native?.acquire()
  return () => native?.release()
}
