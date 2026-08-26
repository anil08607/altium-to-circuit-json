import { type AltiumRecord, getSchematicRecordPoints } from "altiumts"
import type {
  AnyCircuitElement,
  SchematicArc,
  SchematicCircle,
  SchematicPath,
  SchematicRect,
  SchematicTrace,
} from "circuit-json"
import {
  getCoordinate,
  getCorner,
  getLocation,
  getRectangle,
  scalePoint,
} from "./coordinates"
import { altiumColorToCss, createLine } from "./render-text"
import { SCHEMATIC_SHEET_ID, type SchematicContext } from "./sheet-layout"

export function renderPrimitiveRecord({
  record,
  index,
  context,
  color,
  strokeWidth,
}: {
  record: AltiumRecord
  index: number
  context: SchematicContext
  color: string
  strokeWidth: number
}): AnyCircuitElement[] | undefined {
  const kind = record.recordKind
  const scale = context.scale
  if (kind === "27") {
    const points = getSchematicRecordPoints(record).map((point) =>
      scalePoint(point, scale),
    )
    if (points.length < 2) return []
    return [
      {
        type: "schematic_trace",
        schematic_trace_id: `schematic_trace_altium_${index}`,
        schematic_sheet_id: SCHEMATIC_SHEET_ID,
        junctions: [],
        edges: points.slice(1).map((point, pointIndex) => ({
          from: points[pointIndex] ?? point,
          to: point,
        })),
      } satisfies SchematicTrace,
    ]
  }

  if (kind === "6" || kind === "7") {
    const points = getSchematicRecordPoints(record).map((point) =>
      scalePoint(point, scale),
    )
    if (points.length < 2) return []
    return [
      {
        type: "schematic_path",
        schematic_path_id: `schematic_path_altium_${index}`,
        schematic_sheet_id: SCHEMATIC_SHEET_ID,
        points,
        stroke_width: strokeWidth,
        stroke_color: color,
        fill_color:
          kind === "7"
            ? altiumColorToCss(
                record.getCaseInsensitive("AREACOLOR"),
                "transparent",
              )
            : undefined,
        is_filled: kind === "7",
        is_dashed: false,
      } satisfies SchematicPath,
    ]
  }

  if (kind === "13") {
    const location = getLocation(record)
    const corner = getCorner(record)
    if (!location || !corner) return []
    return [
      createLine({
        index,
        start: location,
        end: corner,
        color,
        strokeWidth,
        scale,
      }),
    ]
  }

  if (kind === "10" || kind === "14") {
    const rectangle = getRectangle(record)
    if (!rectangle) return []
    return [
      {
        type: "schematic_rect",
        schematic_rect_id: `schematic_rect_altium_${index}`,
        schematic_sheet_id: SCHEMATIC_SHEET_ID,
        center: scalePoint(
          {
            x: (rectangle.minX + rectangle.maxX) / 2,
            y: (rectangle.minY + rectangle.maxY) / 2,
          },
          scale,
        ),
        width: (rectangle.maxX - rectangle.minX) * scale,
        height: (rectangle.maxY - rectangle.minY) * scale,
        rotation: 0,
        stroke_width: strokeWidth,
        color,
        is_filled: record.getBoolean("ISSOLID") === true,
        fill_color: altiumColorToCss(
          record.getCaseInsensitive("AREACOLOR"),
          "#ffffff",
        ),
        is_dashed: false,
      } satisfies SchematicRect,
    ]
  }

  if (kind === "8") {
    const center = getLocation(record)
    if (!center) return []
    const radiusX = getCoordinate(record, "RADIUS", 1)
    const radiusY = getCoordinate(record, "SECONDARYRADIUS", radiusX)
    if (Math.abs(radiusX - radiusY) < 0.0001) {
      return [
        {
          type: "schematic_circle",
          schematic_circle_id: `schematic_circle_altium_${index}`,
          schematic_sheet_id: SCHEMATIC_SHEET_ID,
          center: scalePoint(center, scale),
          radius: radiusX * scale,
          stroke_width: strokeWidth,
          color,
          is_filled: record.getBoolean("ISSOLID") === true,
          fill_color: altiumColorToCss(
            record.getCaseInsensitive("AREACOLOR"),
            "#ffffff",
          ),
          is_dashed: false,
        } satisfies SchematicCircle,
      ]
    }
    return [
      {
        type: "schematic_path",
        schematic_path_id: `schematic_ellipse_altium_${index}`,
        schematic_sheet_id: SCHEMATIC_SHEET_ID,
        points: approximateEllipse({ center, radiusX, radiusY }).map((point) =>
          scalePoint(point, scale),
        ),
        stroke_width: strokeWidth,
        stroke_color: color,
        fill_color: altiumColorToCss(
          record.getCaseInsensitive("AREACOLOR"),
          "#ffffff",
        ),
        is_filled: record.getBoolean("ISSOLID") === true,
        is_dashed: false,
      } satisfies SchematicPath,
    ]
  }

  if (kind === "11" || kind === "12") {
    const center = getLocation(record)
    if (!center) return []
    return [
      {
        type: "schematic_arc",
        schematic_arc_id: `schematic_arc_altium_${index}`,
        schematic_sheet_id: SCHEMATIC_SHEET_ID,
        center: scalePoint(center, scale),
        radius: getCoordinate(record, "RADIUS", 1) * scale,
        start_angle_degrees: Number(
          record.getCaseInsensitive("STARTANGLE") ?? 0,
        ),
        end_angle_degrees: Number(record.getCaseInsensitive("ENDANGLE") ?? 360),
        direction: "counterclockwise",
        stroke_width: strokeWidth,
        color,
        is_dashed: false,
      } satisfies SchematicArc,
    ]
  }

  return undefined
}

/** Approximate an Altium ellipse with a closed Circuit JSON path. */
export function approximateEllipse({
  center,
  radiusX,
  radiusY,
}: {
  center: { x: number; y: number }
  radiusX: number
  radiusY: number
}): Array<{ x: number; y: number }> {
  return Array.from({ length: 49 }, (_, index) => {
    const radians = (index / 48) * Math.PI * 2
    return {
      x: center.x + Math.cos(radians) * radiusX,
      y: center.y + Math.sin(radians) * radiusY,
    }
  })
}
