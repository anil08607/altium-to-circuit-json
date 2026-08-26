import type { AltiumPoint, AltiumRecord } from "altiumts"

export interface Bounds {
  maxX: number
  maxY: number
  minX: number
  minY: number
}

export type CardinalDirection = "up" | "down" | "left" | "right"

export function getAveragePoint(points: AltiumPoint[]): AltiumPoint {
  if (points.length === 0) return { x: 0, y: 0 }
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  }
}

export function getVectorDifference(
  left: AltiumPoint,
  right: AltiumPoint,
): number {
  const leftLength = Math.hypot(left.x, left.y)
  const rightLength = Math.hypot(right.x, right.y)
  if (leftLength === 0 || rightLength === 0) {
    return Number.POSITIVE_INFINITY
  }
  const cosine =
    (left.x * right.x + left.y * right.y) / (leftLength * rightLength)
  return 1 - Math.max(-1, Math.min(1, cosine))
}

export function getPointDistance(
  left: AltiumPoint,
  right: AltiumPoint,
): number {
  return Math.hypot(left.x - right.x, left.y - right.y)
}

export function subtractPoints(
  left: AltiumPoint,
  right: AltiumPoint,
): AltiumPoint {
  return { x: left.x - right.x, y: left.y - right.y }
}

export function getDirectionForVector(vector: AltiumPoint): CardinalDirection {
  if (Math.abs(vector.x) >= Math.abs(vector.y)) {
    return vector.x >= 0 ? "right" : "left"
  }
  return vector.y >= 0 ? "up" : "down"
}

export function getBoundsForPoints(points: AltiumPoint[]): Bounds {
  if (points.length === 0) return { maxX: 1, maxY: 1, minX: -1, minY: -1 }
  return {
    maxX: Math.max(...points.map((point) => point.x)),
    maxY: Math.max(...points.map((point) => point.y)),
    minX: Math.min(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
  }
}

export function mergeBounds(bounds: Bounds[]): Bounds {
  return {
    maxX: Math.max(...bounds.map((bound) => bound.maxX)),
    maxY: Math.max(...bounds.map((bound) => bound.maxY)),
    minX: Math.min(...bounds.map((bound) => bound.minX)),
    minY: Math.min(...bounds.map((bound) => bound.minY)),
  }
}

export function getBoundsCenter(bounds: Bounds): AltiumPoint {
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  }
}

export function getRectangle(record: AltiumRecord): Bounds | undefined {
  const location = getLocation(record)
  const corner = getCorner(record)
  if (!location || !corner) return undefined
  return {
    maxX: Math.max(location.x, corner.x),
    maxY: Math.max(location.y, corner.y),
    minX: Math.min(location.x, corner.x),
    minY: Math.min(location.y, corner.y),
  }
}

export function getLocation(record: AltiumRecord): AltiumPoint | undefined {
  const x = getCoordinate(record, "LOCATION.X")
  const y = getCoordinate(record, "LOCATION.Y")
  return x === undefined || y === undefined ? undefined : { x, y }
}

export function getCorner(record: AltiumRecord): AltiumPoint | undefined {
  const x = getCoordinate(record, "CORNER.X")
  const y = getCoordinate(record, "CORNER.Y")
  return x === undefined || y === undefined ? undefined : { x, y }
}

function getCoordinate(record: AltiumRecord, key: string): number | undefined {
  const raw = record.getCaseInsensitive(key)
  if (raw === undefined) return undefined
  const integer = Number(raw)
  if (!Number.isFinite(integer)) return undefined
  const fractionRaw = record.getCaseInsensitive(`${key}_FRAC`)
  if (fractionRaw === undefined) return integer
  const fraction = Number(`0.${fractionRaw.replace(/^[+-]/u, "")}`)
  if (!Number.isFinite(fraction)) return integer
  return integer < 0 ? integer - fraction : integer + fraction
}

export function scalePoint(point: AltiumPoint, scale: number): AltiumPoint {
  return { x: point.x * scale, y: point.y * scale }
}

export function pointKey(point: AltiumPoint): string {
  return `${point.x.toFixed(6)},${point.y.toFixed(6)}`
}

export function pointsEqual(
  left: AltiumPoint,
  right: AltiumPoint | undefined,
): boolean {
  return (
    right !== undefined &&
    Math.abs(left.x - right.x) < 0.000001 &&
    Math.abs(left.y - right.y) < 0.000001
  )
}
