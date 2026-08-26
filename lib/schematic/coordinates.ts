import type { AltiumPoint, AltiumRecord } from "altiumts"

export interface Rectangle {
  maxX: number
  maxY: number
  minX: number
  minY: number
}

export function getLocation(record: AltiumRecord): AltiumPoint | undefined {
  if (
    record.getCaseInsensitive("LOCATION.X") === undefined ||
    record.getCaseInsensitive("LOCATION.Y") === undefined
  ) {
    return undefined
  }
  return {
    x: getCoordinate(record, "LOCATION.X"),
    y: getCoordinate(record, "LOCATION.Y"),
  }
}

export function getCorner(record: AltiumRecord): AltiumPoint | undefined {
  if (
    record.getCaseInsensitive("CORNER.X") === undefined ||
    record.getCaseInsensitive("CORNER.Y") === undefined
  ) {
    return undefined
  }
  return {
    x: getCoordinate(record, "CORNER.X"),
    y: getCoordinate(record, "CORNER.Y"),
  }
}

export function getRectangle(record: AltiumRecord): Rectangle | undefined {
  const location = getLocation(record)
  const corner = getCorner(record)
  if (!location || !corner) return undefined
  return {
    minX: Math.min(location.x, corner.x),
    minY: Math.min(location.y, corner.y),
    maxX: Math.max(location.x, corner.x),
    maxY: Math.max(location.y, corner.y),
  }
}

export function getCoordinate(
  record: AltiumRecord,
  key: string,
  fallback = 0,
): number {
  const integerPart = Number(record.getCaseInsensitive(key) ?? fallback)
  const fractionRaw = record.getCaseInsensitive(`${key}_FRAC`)
  if (!Number.isFinite(integerPart) || fractionRaw === undefined) {
    return Number.isFinite(integerPart) ? integerPart : fallback
  }
  const fraction = Number(`0.${fractionRaw.replace(/^[+-]/u, "")}`)
  if (!Number.isFinite(fraction)) return integerPart
  return integerPart < 0 ? integerPart - fraction : integerPart + fraction
}

export function scalePoint(point: AltiumPoint, scale: number): AltiumPoint {
  return { x: point.x * scale, y: point.y * scale }
}
