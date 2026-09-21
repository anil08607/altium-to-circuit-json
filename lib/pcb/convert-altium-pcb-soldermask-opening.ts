import {
  AltiumFillRecord,
  AltiumPadRecord,
  type AltiumRecord,
  AltiumRegionRecord,
  AltiumTrackRecord,
  getPcbRegionGeometry,
} from "altiumts"
import type { PcbCopperPour } from "circuit-json"
import { getAltiumPadGeometry } from "./get-altium-pad-geometry"

const MILS_TO_MILLIMETERS = 0.0254

export function convertAltiumPcbSoldermaskOpening({
  record,
  recordIndex,
}: {
  record: AltiumRecord
  recordIndex: number
}): PcbCopperPour | undefined {
  const layer = mapSoldermaskLayer(record.getDecoded("LAYER"))
  if (!layer) return undefined

  const base = {
    type: "pcb_copper_pour" as const,
    pcb_copper_pour_id: `pcb_copper_pour_soldermask_opening_substrate_only_altium_${recordIndex}`,
    covered_with_solder_mask: false,
    layer,
  }

  if (record instanceof AltiumTrackRecord) {
    if (!record.start || !record.end) return undefined
    return {
      ...base,
      shape: "polygon",
      points: createCapsulePoints({
        start: record.start,
        end: record.end,
        widthMils: record.widthMils ?? 4,
      }),
    }
  }

  if (record instanceof AltiumFillRecord) {
    if (!record.bounds) return undefined
    const width = milsToMillimeters(record.bounds.maxX - record.bounds.minX)
    const height = milsToMillimeters(record.bounds.maxY - record.bounds.minY)
    const rect = {
      ...base,
      shape: "rect" as const,
      center: {
        x: milsToMillimeters((record.bounds.minX + record.bounds.maxX) / 2),
        y: milsToMillimeters((record.bounds.minY + record.bounds.maxY) / 2),
      },
      width,
      height,
      rotation: record.rotation,
    }
    return rect
  }

  if (record instanceof AltiumPadRecord) {
    const position = record.position
    const geometry = getAltiumPadGeometry(record)
    if (!position || !geometry) return undefined
    return {
      ...base,
      shape: "polygon",
      points: createRoundedRectPoints({
        centerX: milsToMillimeters(position.x),
        centerY: milsToMillimeters(position.y),
        width: milsToMillimeters(geometry.widthMils),
        height: milsToMillimeters(geometry.heightMils),
        cornerRadius: milsToMillimeters(
          geometry.cornerRadiusMils ??
            (geometry.shape === "ROUND"
              ? Math.min(geometry.widthMils, geometry.heightMils) / 2
              : 0),
        ),
        rotation: record.rotation,
      }),
    }
  }

  if (record instanceof AltiumRegionRecord) {
    const geometry = getPcbRegionGeometry(record)
    if (geometry.outline.points.length < 3) return undefined
    return {
      ...base,
      shape: "brep",
      brep_shape: {
        outer_ring: {
          vertices: geometry.outline.points.map((point) => ({
            x: milsToMillimeters(point.x),
            y: milsToMillimeters(point.y),
          })),
        },
        inner_rings: geometry.holes.map((hole) => ({
          vertices: hole.points.map((point) => ({
            x: milsToMillimeters(point.x),
            y: milsToMillimeters(point.y),
          })),
        })),
      },
    }
  }

  return undefined
}

export function isAltiumSoldermaskLayer(layer: string | undefined): boolean {
  return mapSoldermaskLayer(layer) !== undefined
}

function mapSoldermaskLayer(
  layer: string | undefined,
): "top" | "bottom" | undefined {
  const normalized = (layer ?? "").replace(/[\s_.-]+/gu, "").toUpperCase()
  if (normalized === "TOPSOLDER") return "top"
  if (normalized === "BOTTOMSOLDER") return "bottom"
  return undefined
}

function milsToMillimeters(value: number): number {
  return value * MILS_TO_MILLIMETERS
}

function createCapsulePoints({
  start,
  end,
  widthMils,
}: {
  start: { x: number; y: number }
  end: { x: number; y: number }
  widthMils: number
}): Array<{ x: number; y: number }> {
  const angle = Math.atan2(end.y - start.y, end.x - start.x)
  const radius = widthMils / 2
  const points = []
  for (let index = 0; index <= 8; index += 1) {
    const capAngle = angle - Math.PI / 2 + (Math.PI * index) / 8
    points.push({
      x: milsToMillimeters(end.x + Math.cos(capAngle) * radius),
      y: milsToMillimeters(end.y + Math.sin(capAngle) * radius),
    })
  }
  for (let index = 0; index <= 8; index += 1) {
    const capAngle = angle + Math.PI / 2 + (Math.PI * index) / 8
    points.push({
      x: milsToMillimeters(start.x + Math.cos(capAngle) * radius),
      y: milsToMillimeters(start.y + Math.sin(capAngle) * radius),
    })
  }
  return points
}

function createRoundedRectPoints({
  centerX,
  centerY,
  width,
  height,
  cornerRadius,
  rotation,
}: {
  centerX: number
  centerY: number
  width: number
  height: number
  cornerRadius: number
  rotation: number
}): Array<{ x: number; y: number }> {
  const halfWidth = width / 2
  const halfHeight = height / 2
  const radius = Math.min(cornerRadius, halfWidth, halfHeight)
  const corners = [
    { x: halfWidth - radius, y: halfHeight - radius, startAngle: 0 },
    { x: -halfWidth + radius, y: halfHeight - radius, startAngle: 90 },
    { x: -halfWidth + radius, y: -halfHeight + radius, startAngle: 180 },
    { x: halfWidth - radius, y: -halfHeight + radius, startAngle: 270 },
  ]
  const radians = (rotation * Math.PI) / 180
  return corners.flatMap((corner) =>
    Array.from({ length: 5 }, (_, index) => {
      const angle = ((corner.startAngle + (90 * index) / 4) * Math.PI) / 180
      const localX = corner.x + Math.cos(angle) * radius
      const localY = corner.y + Math.sin(angle) * radius
      return {
        x: centerX + localX * Math.cos(radians) - localY * Math.sin(radians),
        y: centerY + localX * Math.sin(radians) + localY * Math.cos(radians),
      }
    }),
  )
}
