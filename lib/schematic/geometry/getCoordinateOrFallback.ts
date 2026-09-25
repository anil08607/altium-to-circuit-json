import { type AltiumRecord, getSchematicCoordinate } from "altiumts"

export function getCoordinateOrFallback({
  record,
  key,
  fallback,
}: {
  record: AltiumRecord
  key: string
  fallback: number
}): number {
  return getSchematicCoordinate(record, { key, fallback })
}
