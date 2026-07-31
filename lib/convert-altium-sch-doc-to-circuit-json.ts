import {
  type AltiumPoint,
  type AltiumRecord,
  type AltiumSchDoc,
  getSchematicRecordPoints,
} from "altiumts"
import type {
  AnyCircuitElement,
  SchematicArc,
  SchematicCircle,
  SchematicLine,
  SchematicPath,
  SchematicRect,
  SchematicSheet,
  SchematicText,
  SchematicTrace,
} from "circuit-json"

const DEFAULT_SCHEMATIC_UNIT_SCALE = 0.1
const SCHEMATIC_SHEET_ID = "schematic_sheet_altium"

export interface ConvertAltiumSchDocOptions {
  includeHidden?: boolean
  includeSheetBorder?: boolean
  includeText?: boolean
  schematicUnitScale?: number
  sheetName?: string
}

interface SchematicContext {
  document: AltiumSchDoc
  records: AltiumRecord[]
  scale: number
  sheetRecord?: AltiumRecord
}

export function convertAltiumSchDocToCircuitJson(
  document: AltiumSchDoc,
  options: ConvertAltiumSchDocOptions = {},
): AnyCircuitElement[] {
  const scale = options.schematicUnitScale ?? DEFAULT_SCHEMATIC_UNIT_SCALE
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new RangeError("schematicUnitScale must be a positive finite number")
  }

  const records = document.records
  const sheetRecord = records.find((record) => record.recordKind === "31")
  const context: SchematicContext = { document, records, scale, sheetRecord }
  const elements: AnyCircuitElement[] = [
    {
      type: "schematic_sheet",
      schematic_sheet_id: SCHEMATIC_SHEET_ID,
      name: options.sheetName ?? "Altium schematic",
      sheet_index: 0,
    } satisfies SchematicSheet,
  ]

  if (options.includeSheetBorder !== false) {
    elements.push(createSheetBorder(sheetRecord, scale))
  }

  for (const [index, record] of records.entries()) {
    if (!shouldRenderSchematicRecord(record, context)) continue
    const converted = convertSchematicRecord(record, index, context, options)
    elements.push(...converted)
  }

  return elements
}

function convertSchematicRecord(
  record: AltiumRecord,
  index: number,
  context: SchematicContext,
  options: ConvertAltiumSchDocOptions,
): AnyCircuitElement[] {
  const kind = record.recordKind
  const scale = context.scale
  const color = altiumColorToCss(record.getCaseInsensitive("COLOR"), "#1f2937")
  const strokeWidth = Math.max(
    Number(record.getCaseInsensitive("LINEWIDTH") ?? 1) * scale,
    0.05,
  )

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
    return [createLine(index, location, corner, color, strokeWidth, scale)]
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
        points: approximateEllipse(center, radiusX, radiusY).map((point) =>
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

  if (kind === "2") {
    return convertPin(record, index, context, options, color)
  }

  if (kind === "29") {
    const location = getLocation(record)
    if (!location) return []
    return [
      {
        type: "schematic_circle",
        schematic_circle_id: `schematic_junction_altium_${index}`,
        schematic_sheet_id: SCHEMATIC_SHEET_ID,
        center: scalePoint(location, scale),
        radius: Math.max(
          Number(record.getCaseInsensitive("SIZE") ?? 1) * 0.18,
          0.15,
        ),
        color,
        is_filled: true,
        fill_color: color,
        is_dashed: false,
      } satisfies SchematicCircle,
    ]
  }

  if (kind === "22") {
    const location = getLocation(record)
    if (!location) return []
    const radius = 0.4 / scale
    return [
      createLine(
        index,
        { x: location.x - radius, y: location.y - radius },
        { x: location.x + radius, y: location.y + radius },
        color,
        0.1,
        scale,
        "a",
      ),
      createLine(
        index,
        { x: location.x + radius, y: location.y - radius },
        { x: location.x - radius, y: location.y + radius },
        color,
        0.1,
        scale,
        "b",
      ),
    ]
  }

  if (kind === "17") {
    return convertPowerPort(record, index, context, options, color)
  }

  if (kind === "18") {
    return convertPort(record, index, context, options, color)
  }

  if (kind === "4" || kind === "25" || kind === "34" || kind === "41") {
    if (options.includeText === false) return []
    if (record.getBoolean("ISHIDDEN") && !options.includeHidden) return []
    const text =
      record.getDecoded("TEXT") ??
      record.getDecoded("NAME") ??
      record.getDecoded("DESIGNATOR")
    const location = getLocation(record)
    if (!text || !location) return []
    return [createText(record, index, text, location, color, context)]
  }

  if (kind === "28") {
    const rectangle = getRectangle(record)
    const text = decodeMultilineText(record.getDecoded("TEXT") ?? "")
    if (!rectangle || !text || options.includeText === false) return []
    const fontSize = getFontSize(record, context)
    const fontFamily = getFontFamily(record, context)
    const margin = Math.max(getCoordinate(record, "TEXTMARGIN", 0), 0)
    const frameWidth = rectangle.maxX - rectangle.minX
    const frameHeight = rectangle.maxY - rectangle.minY
    const availableWidth = Math.max(frameWidth - margin * 2, fontSize)
    const availableHeight = Math.max(frameHeight - margin * 2, fontSize)
    const wrappedLines =
      record.getBoolean("WORDWRAP") === false
        ? text.split("\n")
        : wrapSchematicText(text, availableWidth, fontSize, fontFamily)
    const lineHeight = fontSize
    const visibleLines =
      record.getBoolean("CLIPTORECT") === false
        ? wrappedLines
        : wrappedLines.slice(
            0,
            Math.max(Math.ceil(availableHeight / lineHeight), 1),
          )
    const alignment = Number(record.getCaseInsensitive("ALIGNMENT") ?? 1)
    const horizontalAnchor =
      alignment === 2 ? "center" : alignment === 3 ? "right" : "left"
    const textX =
      horizontalAnchor === "center"
        ? (rectangle.minX + rectangle.maxX) / 2
        : horizontalAnchor === "right"
          ? rectangle.maxX - margin
          : rectangle.minX + margin
    const textColor = altiumColorToCss(
      record.getCaseInsensitive("TEXTCOLOR") ??
        record.getCaseInsensitive("COLOR"),
      "#1f2937",
    )
    const elements: AnyCircuitElement[] = visibleLines.map((line, lineIndex) =>
      createDirectText(
        `schematic_text_frame_line_altium_${index}_${lineIndex}`,
        line,
        {
          x: textX,
          y: rectangle.maxY - margin - lineIndex * lineHeight,
        },
        fontSize,
        textColor,
        scale,
        0,
        `top_${horizontalAnchor}` as SchematicText["anchor"],
      ),
    )

    const isSolid = record.getBoolean("ISSOLID") === true
    const showBorder = record.getBoolean("SHOWBORDER") === true
    if (isSolid || showBorder) {
      elements.unshift({
        type: "schematic_rect",
        schematic_rect_id: `schematic_text_frame_altium_${index}`,
        schematic_sheet_id: SCHEMATIC_SHEET_ID,
        center: scalePoint(
          {
            x: (rectangle.minX + rectangle.maxX) / 2,
            y: (rectangle.minY + rectangle.maxY) / 2,
          },
          scale,
        ),
        width: frameWidth * scale,
        height: frameHeight * scale,
        rotation: 0,
        stroke_width: showBorder ? strokeWidth : 0,
        color: showBorder ? color : "transparent",
        is_filled: isSolid,
        fill_color: altiumColorToCss(
          record.getCaseInsensitive("AREACOLOR"),
          "#ffffff",
        ),
        is_dashed: false,
      } satisfies SchematicRect)
    }

    return elements
  }

  return []
}

function convertPin(
  record: AltiumRecord,
  index: number,
  context: SchematicContext,
  options: ConvertAltiumSchDocOptions,
  color: string,
): AnyCircuitElement[] {
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
    createLine(index, location, end, color, 0.1, context.scale, "pin"),
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
  const nameAnchor = directionMatchesText ? "right" : "left"
  const designatorAnchor = directionMatchesText ? "left" : "right"
  const textOffset = 2

  if (showName && name) {
    elements.push(
      createDirectText(
        `schematic_pin_name_altium_${index}`,
        name,
        {
          x: location.x - direction.x * textOffset,
          y: location.y - direction.y * textOffset,
        },
        6,
        color,
        context.scale,
        rotation,
        nameAnchor,
      ),
    )
  }
  if (showDesignator && designator) {
    elements.push(
      createDirectText(
        `schematic_pin_designator_altium_${index}`,
        designator,
        {
          x: location.x + direction.x * textOffset,
          y: location.y + direction.y * textOffset,
        },
        6,
        color,
        context.scale,
        rotation,
        designatorAnchor,
      ),
    )
  }
  return elements
}

function convertPowerPort(
  record: AltiumRecord,
  index: number,
  context: SchematicContext,
  options: ConvertAltiumSchDocOptions,
  color: string,
): AnyCircuitElement[] {
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
  const point = (along: number, across = 0): AltiumPoint => ({
    x: location.x + direction.x * along + perpendicular.x * across,
    y: location.y + direction.y * along + perpendicular.y * across,
  })
  const style = Math.round(Number(record.getCaseInsensitive("STYLE") ?? 2))
  const elements: AnyCircuitElement[] = []
  let labelDistance: number

  if (style === 2) {
    elements.push(
      createLine(
        index,
        location,
        point(8),
        color,
        0.1,
        context.scale,
        "power_port_stem",
      ),
      createLine(
        index,
        point(8, -5),
        point(8, 5),
        color,
        0.1,
        context.scale,
        "power_port_bar",
      ),
    )
    labelDistance = 12
  } else if (style === 5) {
    elements.push(
      createLine(
        index,
        location,
        point(4),
        color,
        0.1,
        context.scale,
        "power_port_stem",
      ),
      {
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
      } satisfies SchematicPath,
    )
    labelDistance = 16
  } else if (style === 4) {
    elements.push(
      createLine(
        index,
        location,
        point(4),
        color,
        0.1,
        context.scale,
        "power_port_stem",
      ),
      ...[
        { along: 4, halfWidth: 7 },
        { along: 8, halfWidth: 4.5 },
        { along: 12, halfWidth: 2 },
      ].map(({ along, halfWidth }, lineIndex) =>
        createLine(
          index,
          point(along, -halfWidth),
          point(along, halfWidth),
          color,
          0.1,
          context.scale,
          `power_port_ground_${lineIndex}`,
        ),
      ),
    )
    labelDistance = 16
  } else if (style === 6) {
    elements.push(
      createLine(
        index,
        location,
        point(4),
        color,
        0.1,
        context.scale,
        "power_port_stem",
      ),
      createLine(
        index,
        point(4, -7),
        point(4, 7),
        color,
        0.1,
        context.scale,
        "power_port_chassis_bar",
      ),
      ...[
        { from: -7, to: -9 },
        { from: 0, to: -2 },
        { from: 7, to: 5 },
      ].map(({ from, to }, lineIndex) =>
        createLine(
          index,
          point(4, from),
          point(9, to),
          color,
          0.1,
          context.scale,
          `power_port_chassis_${lineIndex}`,
        ),
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
      createDirectText(
        `schematic_power_port_text_altium_${index}`,
        text,
        point(labelDistance),
        getFontSize(record, context),
        color,
        context.scale,
        0,
        anchor,
      ),
    )
  }
  return elements
}

function convertPort(
  record: AltiumRecord,
  index: number,
  context: SchematicContext,
  options: ConvertAltiumSchDocOptions,
  color: string,
): AnyCircuitElement[] {
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
      createDirectText(
        `schematic_port_text_altium_${index}`,
        name,
        { x: location.x + width / 2, y: location.y },
        getFontSize(record, context),
        altiumColorToCss(record.getCaseInsensitive("TEXTCOLOR"), color),
        context.scale,
        0,
        "center",
      ),
    )
  }
  return elements
}

function createSheetBorder(
  sheetRecord: AltiumRecord | undefined,
  scale: number,
): SchematicRect {
  const width = Math.max(
    Number(sheetRecord?.getCaseInsensitive("CUSTOMX") ?? 1000),
    1,
  )
  const height = Math.max(
    Number(sheetRecord?.getCaseInsensitive("CUSTOMY") ?? 800),
    1,
  )
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

function createLine(
  index: number,
  start: AltiumPoint,
  end: AltiumPoint,
  color: string,
  strokeWidth: number,
  scale: number,
  suffix = "line",
): SchematicLine {
  return {
    type: "schematic_line",
    schematic_line_id: `schematic_line_altium_${index}_${suffix}`,
    schematic_sheet_id: SCHEMATIC_SHEET_ID,
    x1: start.x * scale,
    y1: start.y * scale,
    x2: end.x * scale,
    y2: end.y * scale,
    stroke_width: strokeWidth,
    color,
    is_dashed: false,
  }
}

function createText(
  record: AltiumRecord,
  index: number,
  text: string,
  location: AltiumPoint,
  color: string,
  context: SchematicContext,
  anchorOverride?: SchematicText["anchor"],
): SchematicText {
  const positioning = getTextPositioning(record)
  return createDirectText(
    `schematic_text_altium_${index}`,
    text,
    location,
    getFontSize(record, context),
    color,
    context.scale,
    positioning.rotation,
    anchorOverride ?? positioning.anchor,
  )
}

function createDirectText(
  id: string,
  text: string,
  location: AltiumPoint,
  fontSize: number,
  color: string,
  scale: number,
  rotation: number,
  anchor: SchematicText["anchor"],
): SchematicText {
  return {
    type: "schematic_text",
    schematic_text_id: id,
    schematic_sheet_id: SCHEMATIC_SHEET_ID,
    text,
    font_size: Math.max(fontSize * scale, 0.2),
    position: scalePoint(location, scale),
    rotation,
    anchor,
    color,
  }
}

function getFontSize(record: AltiumRecord, context: SchematicContext): number {
  const fontId = Math.max(
    Math.round(Number(record.getCaseInsensitive("FONTID") ?? 1)),
    1,
  )
  return Math.max(
    Number(context.sheetRecord?.getCaseInsensitive(`SIZE${fontId}`) ?? 9),
    1,
  )
}

function getFontFamily(
  record: AltiumRecord,
  context: SchematicContext,
): string {
  const fontId = Math.max(
    Math.round(Number(record.getCaseInsensitive("FONTID") ?? 1)),
    1,
  )
  return context.sheetRecord?.getDecoded(`FONTNAME${fontId}`) ?? "Arial"
}

function getTextPositioning(record: AltiumRecord): {
  anchor: SchematicText["anchor"]
  rotation: number
} {
  const justification = Math.min(
    Math.max(Math.round(record.getNumber("JUSTIFICATION") ?? 0), 0),
    8,
  )
  const orientation =
    ((Math.round(record.getNumber("ORIENTATION") ?? 0) % 4) + 4) % 4
  let column = justification % 3
  const row = Math.floor(justification / 3)
  if (orientation === 2 || orientation === 3) column = 2 - column
  const horizontal = ["left", "center", "right"][column] ?? "left"
  const vertical = ["bottom", "center", "top"][row] ?? "bottom"
  const anchor =
    horizontal === "center" && vertical === "center"
      ? "center"
      : (`${vertical}_${horizontal}` as SchematicText["anchor"])
  return {
    anchor,
    rotation: orientation === 1 || orientation === 3 ? 90 : 0,
  }
}

function shouldRenderSchematicRecord(
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

function getLocation(record: AltiumRecord): AltiumPoint | undefined {
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

function getCorner(record: AltiumRecord): AltiumPoint | undefined {
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

function getRectangle(
  record: AltiumRecord,
): { maxX: number; maxY: number; minX: number; minY: number } | undefined {
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

function getCoordinate(
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

function scalePoint(point: AltiumPoint, scale: number): AltiumPoint {
  return { x: point.x * scale, y: point.y * scale }
}

function approximateEllipse(
  center: AltiumPoint,
  radiusX: number,
  radiusY: number,
): AltiumPoint[] {
  return Array.from({ length: 49 }, (_, index) => {
    const radians = (index / 48) * Math.PI * 2
    return {
      x: center.x + Math.cos(radians) * radiusX,
      y: center.y + Math.sin(radians) * radiusY,
    }
  })
}

function decodeMultilineText(text: string): string {
  return text.replaceAll("~1", "\n").replaceAll("\\n", "\n")
}

function wrapSchematicText(
  text: string,
  maximumWidth: number,
  fontSize: number,
  fontFamily: string,
): string[] {
  return text.split("\n").flatMap((paragraph) => {
    if (
      estimateSchematicTextWidth(paragraph, fontSize, fontFamily) <=
      maximumWidth
    ) {
      return [paragraph]
    }
    const words = paragraph.split(/\s+/u)
    const lines: string[] = []
    let line = ""
    for (const word of words) {
      if (!line) {
        line = word
      } else if (
        estimateSchematicTextWidth(`${line} ${word}`, fontSize, fontFamily) <=
        maximumWidth
      ) {
        line = `${line} ${word}`
      } else {
        lines.push(line)
        line = word
      }
    }
    if (line) lines.push(line)
    return lines.length > 0 ? lines : [paragraph]
  })
}

function estimateSchematicTextWidth(
  text: string,
  fontSize: number,
  fontFamily: string,
): number {
  if (/courier|mono/iu.test(fontFamily)) return text.length * fontSize * 0.6
  if (!/times|cambria|serif/iu.test(fontFamily)) {
    return text.length * fontSize * 0.52
  }

  return [...text].reduce((width, character) => {
    const emWidth =
      character === " "
        ? 0.23
        : /[ilI1.,:;!'`|]/u.test(character)
          ? 0.2
          : /[mwMW@%]/u.test(character)
            ? 0.7
            : /[A-Z0-9]/u.test(character)
              ? 0.5
              : 0.4
    return width + emWidth * fontSize
  }, 0)
}

function altiumColorToCss(raw: string | undefined, fallback: string): string {
  if (raw === undefined) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 0) return fallback
  const red = value & 0xff
  const green = (value >>> 8) & 0xff
  const blue = (value >>> 16) & 0xff
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`
}

function toHex(value: number): string {
  return value.toString(16).padStart(2, "0")
}
