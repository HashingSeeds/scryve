export type CornerRadii = readonly [
  topLeft: number | null,
  topRight: number | null,
  bottomRight: number | null,
  bottomLeft: number | null,
]

/**
 * why: iOS has no public API for the display's corner radius, and the private one risks App Store
 * review, so radii are looked up in points, upright, by model identifier. Source: Apple's own simulator
 * device profiles (Xcode 27.2, /Library/Developer/CoreSimulator/Profiles/DeviceTypes/<device>/
 * Contents/Resources/capabilities.plist, `displays[0].cornerRadiusUL/UR/LR/LL`, for each model in
 * profile.plist `representedModelIdentifiers`). Square-cornered models are left out. A number is
 * the same radius on all four corners.
 */
// prettier-ignore
const RADII: readonly (readonly [number | CornerRadii, readonly string[]])[] = [
  [[8, 59, 59, 8], ["iPhone19,4"]],
  [18, ["iPad8,1", "iPad8,2", "iPad8,3", "iPad8,4", "iPad8,5", "iPad8,6", "iPad8,7", "iPad8,8", "iPad8,9", "iPad8,10", "iPad8,11", "iPad8,12", "iPad11,3", "iPad11,4", "iPad13,1", "iPad13,2", "iPad13,4", "iPad13,5", "iPad13,6", "iPad13,7", "iPad13,8", "iPad13,9", "iPad13,10", "iPad13,11", "iPad13,16", "iPad13,17", "iPad14,3", "iPad14,4", "iPad14,5", "iPad14,6", "iPad14,8", "iPad14,9", "iPad14,10", "iPad14,11", "iPad15,3", "iPad15,4", "iPad15,5", "iPad15,6", "iPad16,8", "iPad16,9", "iPad16,10", "iPad16,11"]],
  [21.5, ["iPad14,1", "iPad14,2", "iPad16,1", "iPad16,2"]],
  [25, ["iPad13,18", "iPad13,19", "iPad15,7", "iPad15,8"]],
  [30, ["iPad16,3", "iPad16,4", "iPad16,5", "iPad16,6", "iPad17,1", "iPad17,2", "iPad17,3", "iPad17,4"]],
  [39, ["iPhone10,3", "iPhone10,6", "iPhone11,2", "iPhone11,4", "iPhone11,6", "iPhone12,3", "iPhone12,5"]],
  [41.5, ["iPhone11,8", "iPhone12,1"]],
  [44, ["iPhone13,1", "iPhone14,4"]],
  [47, ["iPad19,1", "iPad19,2", "iPhone13,2", "iPhone13,3"]],
  [47.33, ["iPhone14,2", "iPhone14,5", "iPhone14,7", "iPhone17,5", "iPhone18,5"]],
  [53, ["iPhone13,4"]],
  [53.33, ["iPhone14,3", "iPhone14,8"]],
  [55, ["iPhone15,2", "iPhone15,3", "iPhone15,4", "iPhone15,5", "iPhone16,1", "iPhone16,2", "iPhone17,3", "iPhone17,4"]],
  [62, ["iPhone17,1", "iPhone17,2", "iPhone18,1", "iPhone18,2", "iPhone18,3", "iPhone18,4", "iPhone19,2", "iPhone19,3", "iPhone19,7"]],
]

const BY_MODEL = new Map(
  RADII.flatMap(([radius, models]) =>
    models.map((model): [string, CornerRadii] => [
      model,
      typeof radius === "number" ? [radius, radius, radius, radius] : radius,
    ]),
  ),
)

/** why: Display Zoom shows fewer points per pixel, so `pointScale` (UIScreen scale over nativeScale) shrinks the radius with it. */
export function iosDisplayCornerRadii(model: string, pointScale = 1): CornerRadii | null {
  const radii = BY_MODEL.get(model)
  if (!radii) return null
  const [topLeft, topRight, bottomRight, bottomLeft] = radii.map((radius) =>
    radius === null ? null : Math.round(radius * pointScale * 100) / 100,
  )
  return [topLeft, topRight, bottomRight, bottomLeft]
}
