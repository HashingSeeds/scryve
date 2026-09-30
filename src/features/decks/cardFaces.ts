type CardFaceDetails = {
  name: string
  imageUrl?: string
  smallImageUrl?: string
  manaCost?: string
  typeLine?: string
  oracleText?: string
}

export function readCardFaces(serialized?: string): CardFaceDetails[] {
  if (!serialized) return []
  try {
    const faces: unknown = JSON.parse(serialized)
    return Array.isArray(faces) &&
      faces.length === 2 &&
      faces.every(
        (face): face is CardFaceDetails =>
          typeof face === "object" &&
          face !== null &&
          typeof face.name === "string" &&
          Object.values(face).every((value) => typeof value === "string"),
      )
      ? faces
      : []
  } catch {
    return []
  }
}
