import type { AltiumRecord, AltiumSchDoc } from "altiumts"
import type { AnyCircuitElement, Point, SchematicRect } from "circuit-json"

export const SCHEMATIC_SHEET_ID = "schematic_sheet_altium"

const SCHEMATIC_UNIT_TO_MILLIMETERS = 10.16 / 1.1
const SCHEMATIC_SHEET_INSET = 5 / SCHEMATIC_UNIT_TO_MILLIMETERS
const SCHEMATIC_SHEET_WIDTH = 297 / SCHEMATIC_UNIT_TO_MILLIMETERS
const SCHEMATIC_SHEET_HEIGHT = 210 / SCHEMATIC_UNIT_TO_MILLIMETERS
const SCHEMATIC_SHEET_INNER_WIDTH =
  SCHEMATIC_SHEET_WIDTH - SCHEMATIC_SHEET_INSET * 2
const SCHEMATIC_SHEET_INNER_HEIGHT =
  SCHEMATIC_SHEET_HEIGHT - SCHEMATIC_SHEET_INSET * 2

export interface SheetDimensions {
  height: number
  width: number
}

export interface SchematicContext {
  document: AltiumSchDoc
  records: AltiumRecord[]
  scale: number
  sheetRecord?: AltiumRecord
}

export function getAltiumSheetDimensions(
  sheetRecord: AltiumRecord | undefined,
): SheetDimensions {
  return {
    width: getPositiveNumber(sheetRecord?.getCaseInsensitive("CUSTOMX"), 1000),
    height: getPositiveNumber(sheetRecord?.getCaseInsensitive("CUSTOMY"), 800),
  }
}

export function getPageFitScale(sheetDimensions: SheetDimensions): number {
  return Math.min(
    SCHEMATIC_SHEET_INNER_WIDTH / sheetDimensions.width,
    SCHEMATIC_SHEET_INNER_HEIGHT / sheetDimensions.height,
  )
}

export function createSheetBorder(
  sheetRecord: AltiumRecord | undefined,
  scale: number,
): SchematicRect {
  const { height, width } = getAltiumSheetDimensions(sheetRecord)
  return {
    type: "schematic_rect",
    schematic_rect_id: "schematic_rect_altium_sheet_border",
    schematic_sheet_id: SCHEMATIC_SHEET_ID,
    center: { x: (width * scale) / 2, y: (height * scale) / 2 },
    width: width * scale,
    height: height * scale,
    rotation: 0,
    stroke_width: 0.1,
    color: "#334155",
    is_filled: false,
    is_dashed: false,
  }
}

export function translateSchematicElement(
  element: AnyCircuitElement,
  offset: Point,
): AnyCircuitElement {
  const translatePoint = (point: Point): Point => ({
    x: point.x + offset.x,
    y: point.y + offset.y,
  })
  switch (element.type) {
    case "schematic_component":
    case "schematic_port":
    case "schematic_rect":
    case "schematic_circle":
    case "schematic_arc":
      return { ...element, center: translatePoint(element.center) }
    case "schematic_net_label":
      return {
        ...element,
        center: translatePoint(element.center),
        ...(element.anchor_position
          ? { anchor_position: translatePoint(element.anchor_position) }
          : {}),
      }
    case "schematic_text":
      return { ...element, position: translatePoint(element.position) }
    case "schematic_path":
      return {
        ...element,
        points: element.points.map(translatePoint),
      }
    case "schematic_line":
      return {
        ...element,
        x1: element.x1 + offset.x,
        x2: element.x2 + offset.x,
        y1: element.y1 + offset.y,
        y2: element.y2 + offset.y,
      }
    case "schematic_trace":
      return {
        ...element,
        edges: element.edges.map((edge) => ({
          ...edge,
          from: translatePoint(edge.from),
          to: translatePoint(edge.to),
        })),
        junctions: element.junctions.map(translatePoint),
      }
    default:
      return element
  }
}

export function shouldRenderSchematicRecord(
  record: AltiumRecord,
  context: SchematicContext,
): boolean {
  let ownerPartId = record.getNumber("OWNERPARTID")
  let ownerPartDisplayMode = record.getNumber("OWNERPARTDISPLAYMODE")
  let current: AltiumRecord | undefined = record
  const visited = new Set<AltiumRecord>()

  while (current && !visited.has(current)) {
    visited.add(current)
    const parent = context.document.getParent(current)
    if (!parent) return true

    if (ownerPartId === undefined || ownerPartId <= 0) {
      ownerPartId = current.getNumber("OWNERPARTID")
    }
    if (ownerPartDisplayMode === undefined) {
      ownerPartDisplayMode = current.getNumber("OWNERPARTDISPLAYMODE")
    }

    if (parent.recordKind === "1") {
      const currentPartId = parent.getNumber("CURRENTPARTID") ?? 1
      return (
        (ownerPartId === undefined ||
          ownerPartId <= 0 ||
          ownerPartId === currentPartId) &&
        (ownerPartDisplayMode === undefined || ownerPartDisplayMode === 0)
      )
    }
    current = parent
  }
  return true
}

function getPositiveNumber(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}
