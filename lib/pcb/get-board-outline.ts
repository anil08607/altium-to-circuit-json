import {
  AltiumArcRecord,
  type AltiumBounds,
  AltiumPadRecord,
  type AltiumPcbDocument,
  type AltiumPoint,
  AltiumRegionRecord,
  AltiumTrackRecord,
  AltiumViaRecord,
  getAltiumBounds,
  getPcbRegionGeometry,
} from "altiumts"
import { stitchConnectedAltiumPaths } from "./stitch-connected-paths"

// Legacy board outlines often contain small gaps caused by coordinate rounding.
const MAX_ENDPOINT_GAP_MILS = 5
// Edge-mounted pad centers can sit just outside the routed keepout contour.
const MAX_PLACEMENT_OVERHANG_MILS = 100
// Avoid replacing a valid declared outline for a marginally smaller keepout.
const MIN_STALE_OUTLINE_AREA_RATIO = 1.25

export function getPreferredPcbBoardOutline(
  document: AltiumPcbDocument,
): AltiumPoint[] {
  const declaredOutline = document.boardGeometry.outline.points
  const keepoutOutline = getTightestEnclosingKeepoutOutline(document)
  if (!keepoutOutline) return declaredOutline

  const declaredBounds = getAltiumBounds(declaredOutline)
  const keepoutBounds = getAltiumBounds(keepoutOutline)
  if (!keepoutBounds) return declaredOutline
  if (!declaredBounds || declaredOutline.length < 3) return keepoutOutline

  const declaredArea = getBoundsArea(declaredBounds)
  const keepoutArea = getBoundsArea(keepoutBounds)
  const declaredOutlineIsStale =
    declaredArea >= keepoutArea * MIN_STALE_OUTLINE_AREA_RATIO

  return declaredOutlineIsStale ? keepoutOutline : declaredOutline
}

function getTightestEnclosingKeepoutOutline(
  document: AltiumPcbDocument,
): AltiumPoint[] | undefined {
  const closedOutlines: AltiumPoint[][] = []
  const openPaths: AltiumPoint[][] = []

  for (const record of document.records) {
    if (!isKeepoutLayer(record.getDecoded("LAYER"))) continue
    if (document.getComponentForRecord(record)) continue

    if (record instanceof AltiumRegionRecord) {
      const outline = getPcbRegionGeometry(record).outline.points
      if (outline.length >= 3) closedOutlines.push(removeClosingPoint(outline))
      continue
    }

    if (record instanceof AltiumTrackRecord && record.start && record.end) {
      openPaths.push([record.start, record.end])
      continue
    }

    if (record instanceof AltiumArcRecord) {
      const points = getArcPoints(record)
      if (points.length >= 2) openPaths.push(points)
    }
  }

  for (const path of stitchConnectedAltiumPaths({
    paths: openPaths,
    maxEndpointGapMils: MAX_ENDPOINT_GAP_MILS,
  })) {
    if (!isClosedPath(path)) continue
    closedOutlines.push(removeClosingPoint(path))
  }

  const placedBounds = getPlacedContentBounds(document)
  const candidates = closedOutlines.flatMap((outline) => {
    const bounds = getAltiumBounds(outline)
    if (!bounds || outline.length < 3) return []
    if (
      placedBounds &&
      !boundsContainWithTolerance({
        container: bounds,
        contained: placedBounds,
        tolerance: MAX_PLACEMENT_OVERHANG_MILS,
      })
    ) {
      return []
    }
    return [{ bounds, outline }]
  })

  candidates.sort((left, right) => {
    const areaDifference =
      getBoundsArea(left.bounds) - getBoundsArea(right.bounds)
    return placedBounds ? areaDifference : -areaDifference
  })
  return candidates[0]?.outline
}

function getPlacedContentBounds(
  document: AltiumPcbDocument,
): AltiumBounds | undefined {
  const points: AltiumPoint[] = []
  for (const record of document.records) {
    if (
      record instanceof AltiumPadRecord ||
      record instanceof AltiumViaRecord
    ) {
      if (record.position) points.push(record.position)
      continue
    }
    if (
      record instanceof AltiumTrackRecord &&
      isCopperLayer(record.layer) &&
      record.start &&
      record.end
    ) {
      points.push(record.start, record.end)
    }
  }
  return getAltiumBounds(points)
}

function getArcPoints(record: AltiumArcRecord): AltiumPoint[] {
  const center = record.center
  const radius = record.radiusMils
  if (!center || !radius) return []
  const rawSweep = record.endAngle - record.startAngle
  const sweep =
    rawSweep === 0 || Math.abs(rawSweep) >= 360
      ? 360
      : ((rawSweep % 360) + 360) % 360
  const segmentCount = Math.max(8, Math.ceil(sweep / 7.5))

  return Array.from({ length: segmentCount + 1 }, (_, index) => {
    const angle = record.startAngle + (sweep * index) / segmentCount
    const radians = (angle * Math.PI) / 180
    return {
      x: center.x + Math.cos(radians) * radius,
      y: center.y + Math.sin(radians) * radius,
    }
  })
}

function boundsContainWithTolerance({
  container,
  contained,
  tolerance,
}: {
  container: AltiumBounds
  contained: AltiumBounds
  tolerance: number
}): boolean {
  return (
    contained.minX >= container.minX - tolerance &&
    contained.maxX <= container.maxX + tolerance &&
    contained.minY >= container.minY - tolerance &&
    contained.maxY <= container.maxY + tolerance
  )
}

function getBoundsArea(bounds: AltiumBounds): number {
  return (bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY)
}

function isClosedPath(points: AltiumPoint[]): boolean {
  const first = points[0]
  const last = points.at(-1)
  return Boolean(first && last && pointsApproximatelyEqual(first, last))
}

function removeClosingPoint(points: AltiumPoint[]): AltiumPoint[] {
  const first = points[0]
  const last = points.at(-1)
  return first && last && pointsApproximatelyEqual(first, last)
    ? points.slice(0, -1)
    : points
}

function pointsApproximatelyEqual(
  left: AltiumPoint,
  right: AltiumPoint,
): boolean {
  return (
    Math.abs(left.x - right.x) <= MAX_ENDPOINT_GAP_MILS &&
    Math.abs(left.y - right.y) <= MAX_ENDPOINT_GAP_MILS
  )
}

function isKeepoutLayer(layer: string | undefined): boolean {
  return normalizeLayer(layer) === "KEEPOUT"
}

function isCopperLayer(layer: string | undefined): boolean {
  const normalized = normalizeLayer(layer)
  return (
    normalized === "TOP" ||
    normalized === "TOPLAYER" ||
    normalized === "BOTTOM" ||
    normalized === "BOTTOMLAYER" ||
    /^(?:MID|MIDLAYER|INTERNALPLANE)\d+$/u.test(normalized)
  )
}

function normalizeLayer(layer: string | undefined): string {
  return (layer ?? "").replace(/[\s_.-]+/gu, "").toUpperCase()
}
