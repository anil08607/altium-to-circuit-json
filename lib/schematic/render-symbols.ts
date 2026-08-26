import type { AltiumRecord } from "altiumts"
import type {
  AnyCircuitElement,
  SchematicPath,
  SchematicText,
} from "circuit-json"
import { getLocation, scalePoint } from "./coordinates"
import {
  altiumColorToCss,
  createDirectText,
  createLine,
  getFontSize,
} from "./render-text"
import { SCHEMATIC_SHEET_ID, type SchematicContext } from "./sheet-layout"

export interface SymbolRenderOptions {
  includeHidden?: boolean
  includeText?: boolean
}

export function renderHierarchicalPort({
  record,
  index,
  context,
  options,
  color,
}: {
  record: AltiumRecord
  index: number
  context: SchematicContext
  options: SymbolRenderOptions
  color: string
}): AnyCircuitElement[] {
  const location = getLocation(record)
  if (!location) return []
  const width = Math.max(Number(record.getCaseInsensitive("WIDTH") ?? 16), 10)
  const height = Math.max(Number(record.getCaseInsensitive("HEIGHT") ?? 10), 4)
  const halfHeight = height / 2
  const pointDepth = Math.min(width * 0.22, height)
  const ioType = Number(record.getCaseInsensitive("IOTYPE") ?? 0)
  const points =
    ioType === 1
      ? [
          { x: location.x, y: location.y },
          { x: location.x + pointDepth, y: location.y + halfHeight },
          { x: location.x + width, y: location.y + halfHeight },
          { x: location.x + width, y: location.y - halfHeight },
          { x: location.x + pointDepth, y: location.y - halfHeight },
        ]
      : ioType === 2
        ? [
            { x: location.x, y: location.y + halfHeight },
            {
              x: location.x + width - pointDepth,
              y: location.y + halfHeight,
            },
            { x: location.x + width, y: location.y },
            {
              x: location.x + width - pointDepth,
              y: location.y - halfHeight,
            },
            { x: location.x, y: location.y - halfHeight },
          ]
        : [
            { x: location.x, y: location.y + halfHeight },
            { x: location.x + width, y: location.y + halfHeight },
            { x: location.x + width, y: location.y - halfHeight },
            { x: location.x, y: location.y - halfHeight },
          ]
  const elements: AnyCircuitElement[] = [
    {
      type: "schematic_path",
      schematic_path_id: `schematic_port_altium_${index}`,
      schematic_sheet_id: SCHEMATIC_SHEET_ID,
      points: points.map((point) => scalePoint(point, context.scale)),
      stroke_width: 0.1,
      stroke_color: color,
      fill_color: altiumColorToCss(
        record.getCaseInsensitive("AREACOLOR"),
        "#ffffff",
      ),
      is_filled: true,
      is_dashed: false,
    } satisfies SchematicPath,
  ]
  const name = record.getDecoded("NAME")
  if (name && options.includeText !== false) {
    elements.push(
      createDirectText({
        id: `schematic_port_text_altium_${index}`,
        text: name,
        location: { x: location.x + width / 2, y: location.y },
        fontSize: getFontSize(record, context),
        color: altiumColorToCss(record.getCaseInsensitive("TEXTCOLOR"), color),
        scale: context.scale,
        rotation: 0,
        anchor: "center",
      }),
    )
  }
  return elements
}

export function renderPin({
  record,
  index,
  context,
  options,
  color,
}: {
  record: AltiumRecord
  index: number
  context: SchematicContext
  options: SymbolRenderOptions
  color: string
}): AnyCircuitElement[] {
  const location = getLocation(record)
  if (!location) return []
  const pinConglomerate = record.getNumber("PINCONGLOMERATE")
  const hidden =
    record.getBoolean("ISHIDDEN") ||
    (pinConglomerate !== undefined && (pinConglomerate & 0x04) !== 0)
  if (hidden && !options.includeHidden) return []
  const orientation =
    (pinConglomerate ?? Number(record.getCaseInsensitive("ORIENTATION") ?? 0)) &
    3
  const direction = [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 0, y: -1 },
  ][orientation] ?? { x: 1, y: 0 }
  const length = Math.max(
    Number(record.getCaseInsensitive("PINLENGTH") ?? 10),
    1,
  )
  const end = {
    x: location.x + direction.x * length,
    y: location.y + direction.y * length,
  }
  const elements: AnyCircuitElement[] = [
    createLine({
      index,
      start: location,
      end,
      color,
      strokeWidth: 0.1,
      scale: context.scale,
      suffix: "pin",
    }),
  ]
  if (options.includeText === false) return elements
  const name = record.getDecoded("NAME") ?? ""
  const designator = record.getDecoded("DESIGNATOR") ?? ""
  const showName =
    pinConglomerate === undefined || (pinConglomerate & 0x08) !== 0
  const showDesignator =
    pinConglomerate === undefined || (pinConglomerate & 0x10) !== 0
  const rotation = orientation === 1 || orientation === 3 ? 90 : 0
  const directionMatchesText = orientation === 0 || orientation === 1
  const textOffset = 2
  if (showName && name) {
    elements.push(
      createDirectText({
        id: `schematic_pin_name_altium_${index}`,
        text: name,
        location: {
          x: location.x - direction.x * textOffset,
          y: location.y - direction.y * textOffset,
        },
        fontSize: 6,
        color,
        scale: context.scale,
        rotation,
        anchor: directionMatchesText ? "right" : "left",
      }),
    )
  }
  if (showDesignator && designator) {
    elements.push(
      createDirectText({
        id: `schematic_pin_designator_altium_${index}`,
        text: designator,
        location: {
          x: location.x + direction.x * textOffset,
          y: location.y + direction.y * textOffset,
        },
        fontSize: 6,
        color,
        scale: context.scale,
        rotation,
        anchor: directionMatchesText ? "left" : "right",
      }),
    )
  }
  return elements
}

export function renderPowerPort({
  record,
  index,
  context,
  options,
  color,
}: {
  record: AltiumRecord
  index: number
  context: SchematicContext
  options: SymbolRenderOptions
  color: string
}): AnyCircuitElement[] {
  const location = getLocation(record)
  if (!location) return []
  const orientation =
    ((Math.round(record.getNumber("ORIENTATION") ?? 0) % 4) + 4) % 4
  const direction = [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 0, y: -1 },
  ][orientation] ?? { x: 1, y: 0 }
  const perpendicular = { x: -direction.y, y: direction.x }
  const point = (along: number, across = 0) => ({
    x: location.x + direction.x * along + perpendicular.x * across,
    y: location.y + direction.y * along + perpendicular.y * across,
  })
  const line = (
    start: { x: number; y: number },
    end: { x: number; y: number },
    suffix: string,
  ) =>
    createLine({
      index,
      start,
      end,
      color,
      strokeWidth: 0.1,
      scale: context.scale,
      suffix,
    })
  const style = Math.round(Number(record.getCaseInsensitive("STYLE") ?? 2))
  const elements: AnyCircuitElement[] = []
  let labelDistance: number
  if (style === 2) {
    elements.push(
      line(location, point(8), "power_port_stem"),
      line(point(8, -5), point(8, 5), "power_port_bar"),
    )
    labelDistance = 12
  } else if (style === 5) {
    elements.push(line(location, point(4), "power_port_stem"), {
      type: "schematic_path",
      schematic_path_id: `schematic_power_port_altium_${index}`,
      schematic_sheet_id: SCHEMATIC_SHEET_ID,
      points: [point(4, -7), point(4, 7), point(12)].map((value) =>
        scalePoint(value, context.scale),
      ),
      stroke_width: 0.1,
      stroke_color: color,
      is_filled: false,
      is_dashed: false,
    } satisfies SchematicPath)
    labelDistance = 16
  } else if (style === 4) {
    elements.push(
      line(location, point(4), "power_port_stem"),
      ...[
        { along: 4, halfWidth: 7 },
        { along: 8, halfWidth: 4.5 },
        { along: 12, halfWidth: 2 },
      ].map(({ along, halfWidth }, lineIndex) =>
        line(
          point(along, -halfWidth),
          point(along, halfWidth),
          `power_port_ground_${lineIndex}`,
        ),
      ),
    )
    labelDistance = 16
  } else if (style === 6) {
    elements.push(
      line(location, point(4), "power_port_stem"),
      line(point(4, -7), point(4, 7), "power_port_chassis_bar"),
      ...[
        { from: -7, to: -9 },
        { from: 0, to: -2 },
        { from: 7, to: 5 },
      ].map(({ from, to }, lineIndex) =>
        line(point(4, from), point(9, to), `power_port_chassis_${lineIndex}`),
      ),
    )
    labelDistance = 14
  } else {
    elements.push({
      type: "schematic_path",
      schematic_path_id: `schematic_power_port_altium_${index}`,
      schematic_sheet_id: SCHEMATIC_SHEET_ID,
      points: [location, point(10, -5), point(10, 5)].map((value) =>
        scalePoint(value, context.scale),
      ),
      stroke_width: 0.1,
      stroke_color: color,
      fill_color: color,
      is_filled: true,
      is_dashed: false,
    } satisfies SchematicPath)
    labelDistance = 14
  }
  const text = record.getDecoded("TEXT") ?? record.getDecoded("NAME")
  if (
    text &&
    options.includeText !== false &&
    record.getBoolean("SHOWNETNAME") !== false
  ) {
    const vertical = direction.y !== 0
    const anchor: SchematicText["anchor"] = vertical
      ? direction.y > 0
        ? "bottom_center"
        : "top_center"
      : direction.x > 0
        ? "center_left"
        : "center_right"
    elements.push(
      createDirectText({
        id: `schematic_power_port_text_altium_${index}`,
        text,
        location: point(labelDistance),
        fontSize: getFontSize(record, context),
        color,
        scale: context.scale,
        rotation: 0,
        anchor,
      }),
    )
  }
  return elements
}
