import type { AltiumPoint, AltiumRecord } from "altiumts"
import type {
  AnyCircuitElement,
  SchematicLine,
  SchematicRect,
  SchematicText,
} from "circuit-json"
import type { ConvertAltiumSchDocOptions } from "../convert-altium-sch-doc-to-circuit-json"
import {
  getCoordinate,
  getLocation,
  getRectangle,
  scalePoint,
} from "./coordinates"
import { SCHEMATIC_SHEET_ID, type SchematicContext } from "./sheet-layout"

export function renderTextRecord({
  record,
  index,
  context,
  options,
  color,
  strokeWidth,
}: {
  record: AltiumRecord
  index: number
  context: SchematicContext
  options: ConvertAltiumSchDocOptions
  color: string
  strokeWidth: number
}): AnyCircuitElement[] | undefined {
  const kind = record.recordKind
  const scale = context.scale
  if (kind === "4" || kind === "25" || kind === "34" || kind === "41") {
    if (options.includeText === false) return []
    if (record.getBoolean("ISHIDDEN") && !options.includeHidden) return []
    const text =
      record.getDecoded("TEXT") ??
      record.getDecoded("NAME") ??
      record.getDecoded("DESIGNATOR")
    const location = getLocation(record)
    if (!text || !location) return []
    return [createText({ record, index, text, location, color, context })]
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
      createDirectText({
        id: `schematic_text_frame_line_altium_${index}_${lineIndex}`,
        text: line,
        location: {
          x: textX,
          y: rectangle.maxY - margin - lineIndex * lineHeight,
        },
        fontSize,
        color: textColor,
        scale,
        rotation: 0,
        anchor: `top_${horizontalAnchor}` as SchematicText["anchor"],
      }),
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

  return undefined
}

export function createLine({
  index,
  start,
  end,
  color,
  strokeWidth,
  scale,
  suffix = "line",
}: {
  index: number
  start: AltiumPoint
  end: AltiumPoint
  color: string
  strokeWidth: number
  scale: number
  suffix?: string
}): SchematicLine {
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

export function createText({
  record,
  index,
  text,
  location,
  color,
  context,
}: {
  record: AltiumRecord
  index: number
  text: string
  location: AltiumPoint
  color: string
  context: SchematicContext
}): SchematicText {
  const positioning = getTextPositioning(record)
  return createDirectText({
    id: `schematic_text_altium_${index}`,
    text,
    location,
    fontSize: getFontSize(record, context),
    color,
    scale: context.scale,
    rotation: positioning.rotation,
    anchor: positioning.anchor,
  })
}

export function createDirectText({
  id,
  text,
  location,
  fontSize,
  color,
  scale,
  rotation,
  anchor,
}: {
  id: string
  text: string
  location: AltiumPoint
  fontSize: number
  color: string
  scale: number
  rotation: number
  anchor: SchematicText["anchor"]
}): SchematicText {
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

export function getFontSize(
  record: AltiumRecord,
  context: SchematicContext,
): number {
  const fontId = Math.max(
    Math.round(Number(record.getCaseInsensitive("FONTID") ?? 1)),
    1,
  )
  return Math.max(
    Number(context.sheetRecord?.getCaseInsensitive(`SIZE${fontId}`) ?? 9),
    1,
  )
}

export function getFontFamily(
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
  return { anchor, rotation: orientation === 1 || orientation === 3 ? 90 : 0 }
}

export function decodeMultilineText(text: string): string {
  return text.replaceAll("~1", "\n").replaceAll("\\n", "\n")
}

export function wrapSchematicText(
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
    const lines: string[] = []
    let line = ""
    for (const word of paragraph.split(/\s+/u)) {
      if (!line) line = word
      else if (
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

export function altiumColorToCss(
  raw: string | undefined,
  fallback: string,
): string {
  if (raw === undefined) return fallback
  const colorValue = Number(raw)
  if (!Number.isInteger(colorValue) || colorValue < 0) return fallback
  const red = colorValue & 0xff
  const green = (colorValue >>> 8) & 0xff
  const blue = (colorValue >>> 16) & 0xff
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`
}

function toHex(value: number): string {
  return value.toString(16).padStart(2, "0")
}
