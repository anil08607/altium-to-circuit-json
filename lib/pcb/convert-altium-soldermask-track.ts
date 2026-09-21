import type { AltiumTrackRecord } from "altiumts"
import type { PcbSoldermaskOpening, Point } from "circuit-json"

const MILS_TO_MM = 0.0254
// Bound the sagitta of the polygonal round caps to one micrometer.
const MAX_CAP_ERROR_MM = 0.001

export function mapAltiumSoldermaskLayer(
  layer: string | undefined,
): "top" | "bottom" | undefined {
  const normalized = (layer ?? "").replace(/[\s_.-]+/gu, "").toUpperCase()
  if (normalized === "TOPSOLDER") return "top"
  if (normalized === "BOTTOMSOLDER") return "bottom"
  return undefined
}

/** Solder-layer strokes remove mask; they do not create electrical copper. */
export function convertAltiumSoldermaskTrack(
  record: AltiumTrackRecord,
  recordIndex: number,
): PcbSoldermaskOpening | undefined {
  const layer = mapAltiumSoldermaskLayer(record.layer)
  const start = record.start
  const end = record.end
  const widthMils = record.widthMils
  if (
    !layer ||
    !start ||
    !end ||
    widthMils === undefined ||
    widthMils <= 0 ||
    ![start.x, start.y, end.x, end.y, widthMils].every(Number.isFinite)
  ) {
    return undefined
  }

  const base = {
    type: "pcb_soldermask_opening" as const,
    pcb_soldermask_opening_id: `pcb_soldermask_opening_altium_track_${recordIndex}`,
    layer,
  }
  const radius = (widthMils * MILS_TO_MM) / 2
  const startMm = { x: start.x * MILS_TO_MM, y: start.y * MILS_TO_MM }
  const endMm = { x: end.x * MILS_TO_MM, y: end.y * MILS_TO_MM }
  if (start.x === end.x && start.y === end.y) {
    return { ...base, shape: "circle", ...startMm, radius }
  }

  const angle = Math.atan2(end.y - start.y, end.x - start.x)
  // An even number of segments includes the tip of each semicircular cap.
  const segments =
    2 *
    Math.max(
      2,
      Math.ceil(
        Math.PI / (4 * Math.acos(1 - Math.min(MAX_CAP_ERROR_MM / radius, 1))),
      ),
    )
  const cap = (center: Point, startAngle: number): Point[] =>
    Array.from({ length: segments + 1 }, (_, index) => {
      const capAngle = startAngle + (index * Math.PI) / segments
      return {
        x: center.x + radius * Math.cos(capAngle),
        y: center.y + radius * Math.sin(capAngle),
      }
    })

  return {
    ...base,
    shape: "polygon",
    points: [
      ...cap(endMm, angle - Math.PI / 2),
      ...cap(startMm, angle + Math.PI / 2),
    ],
  }
}
