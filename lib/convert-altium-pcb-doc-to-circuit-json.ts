import {
  AltiumArcRecord,
  AltiumFillRecord,
  AltiumPadRecord,
  type AltiumPcbDocument,
  type AltiumPoint,
  type AltiumRecord,
  AltiumTextRecord,
  AltiumTrackRecord,
  AltiumViaRecord,
  getAltiumBounds,
  getPcbLayerStack,
  parseAltiumMeasurementToMils,
} from "altiumts"
import type {
  AnyCircuitElement,
  LayerRef,
  PcbBoard,
  PcbComponent,
  PcbCutout,
  PcbHole,
  PcbPlatedHole,
  PcbSilkscreenLine,
  PcbSilkscreenPath,
  PcbSilkscreenRect,
  PcbSilkscreenText,
  PcbSmtPad,
  PcbTrace,
  PcbVia,
} from "circuit-json"

const MILS_TO_MILLIMETERS = 0.0254
const BOARD_ID = "pcb_board_altium"
const BOARD_GRAPHICS_COMPONENT_ID = "pcb_component_altium_board_graphics"

export interface ConvertAltiumPcbDocOptions {
  includeBoardOutline?: boolean
  includeComponents?: boolean
  includePads?: boolean
  includeSilkscreen?: boolean
  includeTraces?: boolean
  includeVias?: boolean
}

export function convertAltiumPcbDocToCircuitJson(
  document: AltiumPcbDocument,
  options: ConvertAltiumPcbDocOptions = {},
): AnyCircuitElement[] {
  const elements: AnyCircuitElement[] = []

  if (options.includeBoardOutline !== false) {
    elements.push(createBoard(document))
    for (const [index, cutout] of document.boardGeometry.cutouts.entries()) {
      if (cutout.outline.points.length < 3) continue
      elements.push({
        type: "pcb_cutout",
        pcb_cutout_id: `pcb_cutout_altium_${index}`,
        pcb_board_id: BOARD_ID,
        shape: "polygon",
        points: cutout.outline.points.map(toMillimeterPoint),
      } satisfies PcbCutout)
    }
  }

  if (options.includeComponents !== false) {
    for (const [index, component] of document.components.entries()) {
      const position = component.position
      if (!position) continue
      const bounds = document.getComponentBounds(component)
      elements.push({
        type: "pcb_component",
        pcb_component_id: componentId(index),
        source_component_id: `source_component_altium_${index}`,
        center: toMillimeterPoint(position),
        width: milsToMillimeters(
          bounds ? bounds.maxX - bounds.minX : (component.heightMils ?? 20),
        ),
        height: milsToMillimeters(
          bounds ? bounds.maxY - bounds.minY : (component.heightMils ?? 20),
        ),
        layer: component.side === "bottom" ? "bottom" : "top",
        rotation: component.rotation,
        position_mode: "none",
        obstructs_within_bounds: false,
      } satisfies PcbComponent)
    }
  }

  for (const [index, record] of document.records.entries()) {
    if (record instanceof AltiumPadRecord && options.includePads !== false) {
      const pad = convertPad(record, index)
      if (pad) elements.push(pad)
      continue
    }

    if (record instanceof AltiumTrackRecord) {
      if (isOverlayLayer(record.layer)) {
        if (options.includeSilkscreen === false) continue
        const line = convertSilkscreenLine(record, index)
        if (line) elements.push(line)
      } else if (options.includeTraces !== false) {
        const trace = convertTrack(record, index)
        if (trace) elements.push(trace)
      }
      continue
    }

    if (record instanceof AltiumViaRecord && options.includeVias !== false) {
      const via = convertVia(record, index)
      if (via) elements.push(via)
      continue
    }

    if (
      options.includeSilkscreen === false ||
      !isOverlayLayer(getLayer(record))
    ) {
      continue
    }

    if (record instanceof AltiumArcRecord) {
      const path = convertSilkscreenArc(record, index)
      if (path) elements.push(path)
    } else if (record instanceof AltiumFillRecord) {
      const rect = convertSilkscreenFill(record, index)
      if (rect) elements.push(rect)
    } else if (record instanceof AltiumTextRecord) {
      const text = convertSilkscreenText(record, index)
      if (text) elements.push(text)
    }
  }

  return elements
}

function createBoard(document: AltiumPcbDocument): PcbBoard {
  const outline = document.boardGeometry.outline.points.map(toMillimeterPoint)
  const bounds =
    getAltiumBounds(document.boardGeometry.outline.points) ??
    getFallbackPcbBounds(document.records)
  const width = Math.max(milsToMillimeters(bounds.maxX - bounds.minX), 0.1)
  const height = Math.max(milsToMillimeters(bounds.maxY - bounds.minY), 0.1)
  const numLayers = document.board
    ? Math.max(
        getPcbLayerStack(document.board).entries.filter((entry) =>
          Boolean(mapCopperLayer(entry.name ?? entry.layerId)),
        ).length,
        2,
      )
    : 2

  return {
    type: "pcb_board",
    pcb_board_id: BOARD_ID,
    center: {
      x: milsToMillimeters((bounds.minX + bounds.maxX) / 2),
      y: milsToMillimeters((bounds.minY + bounds.maxY) / 2),
    },
    width,
    height,
    ...(outline.length >= 3 ? { shape: "polygon" as const, outline } : {}),
    thickness: 1.6,
    num_layers: numLayers,
    material: "fr4",
  }
}

function getFallbackPcbBounds(records: AltiumRecord[]): {
  maxX: number
  maxY: number
  minX: number
  minY: number
} {
  const points: AltiumPoint[] = []
  for (const record of records) {
    if (
      record instanceof AltiumPadRecord ||
      record instanceof AltiumViaRecord
    ) {
      if (record.position) points.push(record.position)
    } else if (record instanceof AltiumTrackRecord) {
      if (record.start) points.push(record.start)
      if (record.end) points.push(record.end)
    }
  }
  return getAltiumBounds(points) ?? { minX: 0, minY: 0, maxX: 1000, maxY: 800 }
}

function convertTrack(
  record: AltiumTrackRecord,
  index: number,
): PcbTrace | undefined {
  const start = record.start
  const end = record.end
  const layer = mapCopperLayer(record.layer)
  if (!start || !end || !layer) return undefined
  const width = milsToMillimeters(record.widthMils ?? 4)
  return {
    type: "pcb_trace",
    pcb_trace_id: `pcb_trace_altium_${index}`,
    should_round_corners: true,
    route: [
      { route_type: "wire", ...toMillimeterPoint(start), width, layer },
      { route_type: "wire", ...toMillimeterPoint(end), width, layer },
    ],
  }
}

function convertVia(
  record: AltiumViaRecord,
  index: number,
): PcbVia | undefined {
  if (!record.position) return undefined
  const startLayer = mapCopperLayer(record.startLayer) ?? "top"
  const endLayer = mapCopperLayer(record.endLayer) ?? "bottom"
  const layers = startLayer === endLayer ? [startLayer] : [startLayer, endLayer]
  const outerDiameter = milsToMillimeters(record.diameterMils ?? 20)
  return {
    type: "pcb_via",
    pcb_via_id: `pcb_via_altium_${index}`,
    ...toMillimeterPoint(record.position),
    outer_diameter: outerDiameter,
    hole_diameter: milsToMillimeters(
      record.holeSizeMils ?? (record.diameterMils ?? 20) * 0.45,
    ),
    layers,
    is_tented: record.tentedTop === true && record.tentedBottom === true,
  }
}

function convertPad(
  record: AltiumPadRecord,
  index: number,
): PcbSmtPad | PcbPlatedHole | PcbHole | undefined {
  const position = record.position
  const size = record.size
  if (!position || !size) return undefined
  const x = milsToMillimeters(position.x)
  const y = milsToMillimeters(position.y)
  const width = milsToMillimeters(size.width)
  const height = milsToMillimeters(size.height)
  const holeDiameter = milsToMillimeters(record.holeSizeMils ?? 0)
  const shape = normalizeShape(record.shape)
  const id = `altium_${index}`

  if (record.plated === false && holeDiameter > 0) {
    return {
      type: "pcb_hole",
      pcb_hole_id: `pcb_hole_${id}`,
      hole_shape: "circle",
      hole_diameter: holeDiameter,
      x,
      y,
    }
  }

  if (record.behavior === "through-hole" || holeDiameter > 0) {
    const slotLengthMils = getMeasurement(record, "SLOTLENGTH")
    const holeWidthMils = record.holeWidthMils ?? record.holeSizeMils
    const isSlot =
      normalizeShape(record.holeType).includes("SLOT") ||
      (slotLengthMils ?? 0) > (record.holeSizeMils ?? 0) ||
      (holeWidthMils ?? 0) > (record.holeSizeMils ?? 0)
    const layers: LayerRef[] = ["top", "bottom"]

    if (isSlot) {
      const holeWidth = milsToMillimeters(
        Math.max(
          slotLengthMils ?? holeWidthMils ?? record.holeSizeMils ?? 1,
          1,
        ),
      )
      const holeHeight = Math.max(holeDiameter, MILS_TO_MILLIMETERS)
      if (isRectangularShape(shape)) {
        const rotated = record.holeRotation !== 0 || record.rotation !== 0
        return {
          type: "pcb_plated_hole",
          pcb_plated_hole_id: `pcb_plated_hole_${id}`,
          shape: rotated
            ? "rotated_pill_hole_with_rect_pad"
            : "pill_hole_with_rect_pad",
          hole_shape: rotated ? "rotated_pill" : "pill",
          pad_shape: "rect",
          hole_width: holeWidth,
          hole_height: holeHeight,
          ...(rotated ? { hole_ccw_rotation: record.holeRotation } : {}),
          rect_pad_width: width,
          rect_pad_height: height,
          ...(rotated ? { rect_ccw_rotation: record.rotation } : {}),
          hole_offset_x: 0,
          hole_offset_y: 0,
          x,
          y,
          layers,
        } as PcbPlatedHole
      }
      return {
        type: "pcb_plated_hole",
        pcb_plated_hole_id: `pcb_plated_hole_${id}`,
        shape: "pill",
        outer_width: width,
        outer_height: height,
        hole_width: holeWidth,
        hole_height: holeHeight,
        ccw_rotation: record.holeRotation || record.rotation,
        x,
        y,
        layers,
      }
    }

    if (isRectangularShape(shape)) {
      return {
        type: "pcb_plated_hole",
        pcb_plated_hole_id: `pcb_plated_hole_${id}`,
        shape: "circular_hole_with_rect_pad",
        hole_shape: "circle",
        pad_shape: "rect",
        hole_diameter: Math.max(holeDiameter, MILS_TO_MILLIMETERS),
        rect_pad_width: width,
        rect_pad_height: height,
        rect_border_radius: shape.includes("ROUNDRECT")
          ? Math.min(width, height) * 0.18
          : 0,
        rect_ccw_rotation: record.rotation,
        hole_offset_x: 0,
        hole_offset_y: 0,
        x,
        y,
        layers,
      }
    }

    if (shape.includes("OCTAGON")) {
      return {
        type: "pcb_plated_hole",
        pcb_plated_hole_id: `pcb_plated_hole_${id}`,
        shape: "hole_with_polygon_pad",
        hole_shape: "circle",
        hole_diameter: Math.max(holeDiameter, MILS_TO_MILLIMETERS),
        pad_outline: createOctagonPoints(x, y, width, height, record.rotation),
        hole_offset_x: 0,
        hole_offset_y: 0,
        x,
        y,
        layers,
      }
    }

    if (shape === "ROUND" || shape === "CIRCLE" || shape === "OVAL") {
      if (Math.abs(width - height) >= 0.0001) {
        return {
          type: "pcb_plated_hole",
          pcb_plated_hole_id: `pcb_plated_hole_${id}`,
          shape: "pill",
          outer_width: width,
          outer_height: height,
          hole_width: Math.max(holeDiameter, MILS_TO_MILLIMETERS),
          hole_height: Math.max(holeDiameter, MILS_TO_MILLIMETERS),
          ccw_rotation: record.rotation,
          x,
          y,
          layers,
        }
      }
    }

    return {
      type: "pcb_plated_hole",
      pcb_plated_hole_id: `pcb_plated_hole_${id}`,
      shape: "circle",
      outer_diameter: Math.max(width, height),
      hole_diameter: Math.max(holeDiameter, MILS_TO_MILLIMETERS),
      x,
      y,
      layers,
    }
  }

  const layer = mapCopperLayer(record.layer)
  if (!layer) return undefined
  const base = {
    type: "pcb_smtpad" as const,
    pcb_smtpad_id: `pcb_smtpad_${id}`,
    x,
    y,
    layer,
    soldermask_margin:
      record.solderMaskExpansionMils === undefined
        ? undefined
        : milsToMillimeters(record.solderMaskExpansionMils),
  }

  if (shape.includes("OCTAGON")) {
    return {
      ...base,
      shape: "polygon",
      points: createOctagonPoints(x, y, width, height, record.rotation),
    }
  }
  if (shape === "ROUND" || shape === "CIRCLE" || shape === "OVAL") {
    if (Math.abs(width - height) < 0.0001) {
      return { ...base, shape: "circle", radius: width / 2 }
    }
    return record.rotation === 0
      ? {
          ...base,
          shape: "pill",
          width,
          height,
          radius: Math.min(width, height) / 2,
        }
      : {
          ...base,
          shape: "rotated_pill",
          width,
          height,
          radius: Math.min(width, height) / 2,
          ccw_rotation: record.rotation,
        }
  }

  const cornerRadius = shape.includes("ROUNDRECT")
    ? Math.min(width, height) * 0.18
    : undefined
  return record.rotation === 0
    ? { ...base, shape: "rect", width, height, corner_radius: cornerRadius }
    : {
        ...base,
        shape: "rotated_rect",
        width,
        height,
        corner_radius: cornerRadius,
        ccw_rotation: record.rotation,
      }
}

function convertSilkscreenLine(
  record: AltiumTrackRecord,
  index: number,
): PcbSilkscreenLine | undefined {
  if (!record.start || !record.end) return undefined
  return {
    type: "pcb_silkscreen_line",
    pcb_silkscreen_line_id: `pcb_silkscreen_line_altium_${index}`,
    pcb_component_id: pcbComponentIdForRecord(record),
    stroke_width: milsToMillimeters(record.widthMils ?? 4),
    ...withNumberedPoints(record.start, record.end),
    layer: mapOverlayLayer(record.layer),
  }
}

function convertSilkscreenArc(
  record: AltiumArcRecord,
  index: number,
): PcbSilkscreenPath | undefined {
  if (!record.center || !record.radiusMils) return undefined
  const points = approximateArc(
    record.center,
    record.radiusMils,
    record.startAngle,
    record.endAngle,
  )
  return {
    type: "pcb_silkscreen_path",
    pcb_silkscreen_path_id: `pcb_silkscreen_path_altium_${index}`,
    pcb_component_id: pcbComponentIdForRecord(record),
    route: points.map(toMillimeterPoint),
    stroke_width: milsToMillimeters(record.widthMils ?? 4),
    layer: mapOverlayLayer(record.layer),
  }
}

function convertSilkscreenFill(
  record: AltiumFillRecord,
  index: number,
): PcbSilkscreenRect | undefined {
  if (!record.bounds) return undefined
  const width = milsToMillimeters(record.bounds.maxX - record.bounds.minX)
  const height = milsToMillimeters(record.bounds.maxY - record.bounds.minY)
  return {
    type: "pcb_silkscreen_rect",
    pcb_silkscreen_rect_id: `pcb_silkscreen_rect_altium_${index}`,
    pcb_component_id: pcbComponentIdForRecord(record),
    center: {
      x: milsToMillimeters((record.bounds.minX + record.bounds.maxX) / 2),
      y: milsToMillimeters((record.bounds.minY + record.bounds.maxY) / 2),
    },
    width,
    height,
    stroke_width: Math.min(width, height),
    is_filled: true,
    has_stroke: false,
    ccw_rotation: record.rotation,
    layer: mapOverlayLayer(record.layer),
  }
}

function convertSilkscreenText(
  record: AltiumTextRecord,
  index: number,
): PcbSilkscreenText | undefined {
  const text =
    decodeAltiumWideString(record.getDecoded("WIDESTRING")) ||
    record.getDecoded("TEXT") ||
    record.text
  if (!record.position || !text) return undefined
  return {
    type: "pcb_silkscreen_text",
    pcb_silkscreen_text_id: `pcb_silkscreen_text_altium_${index}`,
    pcb_component_id: pcbComponentIdForRecord(record),
    text,
    font: "tscircuit2024",
    font_size: milsToMillimeters(record.heightMils ?? 30),
    anchor_position: toMillimeterPoint(record.position),
    anchor_alignment: mapTextAnchor(record.justification),
    ccw_rotation: record.rotation,
    layer: mapOverlayLayer(record.layer),
    is_mirrored: record.mirrored,
  }
}

function decodeAltiumWideString(raw: string | undefined): string {
  if (!raw) return ""
  if (!/^\d+(?:,\d+)*$/u.test(raw)) return raw
  try {
    return String.fromCodePoint(...raw.split(",").map(Number))
  } catch {
    return raw
  }
}

function pcbComponentIdForRecord(record: AltiumRecord): string {
  const index = record.getNumber("COMPONENT")
  return index === undefined || index < 0
    ? BOARD_GRAPHICS_COMPONENT_ID
    : componentId(index)
}

function componentId(index: number): string {
  return `pcb_component_altium_${index}`
}

function mapTextAnchor(
  justification: string | undefined,
): "bottom_left" | "bottom_center" | "bottom_right" | "center" {
  const normalized = justification?.replace(/[\s_-]+/gu, "").toUpperCase()
  if (normalized?.includes("CENTER")) return "bottom_center"
  if (normalized?.includes("RIGHT")) return "bottom_right"
  if (normalized?.includes("LEFT")) return "bottom_left"
  return "center"
}

function mapCopperLayer(layer: string | undefined): LayerRef | undefined {
  const normalized = normalizeLayer(layer)
  if (normalized === "TOP" || normalized === "TOPLAYER") return "top"
  if (normalized === "BOTTOM" || normalized === "BOTTOMLAYER") return "bottom"
  const innerMatch = /^(?:MID|MIDLAYER|INTERNALPLANE)(\d+)$/u.exec(normalized)
  if (!innerMatch?.[1]) return undefined
  const innerNumber = Math.min(Math.max(Number(innerMatch[1]), 1), 8)
  return `inner${innerNumber}` as LayerRef
}

function isOverlayLayer(layer: string | undefined): boolean {
  const normalized = normalizeLayer(layer)
  return normalized === "TOPOVERLAY" || normalized === "BOTTOMOVERLAY"
}

function mapOverlayLayer(layer: string | undefined): "top" | "bottom" {
  return normalizeLayer(layer) === "BOTTOMOVERLAY" ? "bottom" : "top"
}

function getLayer(record: AltiumRecord): string | undefined {
  return record.getDecoded("LAYER")
}

function normalizeLayer(layer: string | undefined): string {
  return (layer ?? "").replace(/[\s_.-]+/gu, "").toUpperCase()
}

function normalizeShape(shape: string | undefined): string {
  return (shape ?? "ROUND").replace(/[\s_-]+/gu, "").toUpperCase()
}

function isRectangularShape(shape: string): boolean {
  return shape.includes("RECT") || shape === "SQUARE"
}

function getMeasurement(record: AltiumRecord, key: string): number | undefined {
  return parseAltiumMeasurementToMils(record.getCaseInsensitive(key))
}

function milsToMillimeters(value: number): number {
  return value * MILS_TO_MILLIMETERS
}

function toMillimeterPoint(point: AltiumPoint): { x: number; y: number } {
  return { x: milsToMillimeters(point.x), y: milsToMillimeters(point.y) }
}

function withNumberedPoints(
  start: AltiumPoint,
  end: AltiumPoint,
): { x1: number; x2: number; y1: number; y2: number } {
  return {
    x1: milsToMillimeters(start.x),
    y1: milsToMillimeters(start.y),
    x2: milsToMillimeters(end.x),
    y2: milsToMillimeters(end.y),
  }
}

function approximateArc(
  center: AltiumPoint,
  radius: number,
  startAngle: number,
  endAngle: number,
): AltiumPoint[] {
  const sweep = endAngle - startAngle || 360
  const segments = Math.max(8, Math.ceil(Math.abs(sweep) / 7.5))
  return Array.from({ length: segments + 1 }, (_, index) => {
    const angle = startAngle + (sweep * index) / segments
    const radians = (angle * Math.PI) / 180
    return {
      x: center.x + Math.cos(radians) * radius,
      y: center.y + Math.sin(radians) * radius,
    }
  })
}

function createOctagonPoints(
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: number,
): Array<{ x: number; y: number }> {
  const halfWidth = width / 2
  const halfHeight = height / 2
  const chamfer = Math.min(width, height) / 4
  const points = [
    { x: -halfWidth + chamfer, y: -halfHeight },
    { x: halfWidth - chamfer, y: -halfHeight },
    { x: halfWidth, y: -halfHeight + chamfer },
    { x: halfWidth, y: halfHeight - chamfer },
    { x: halfWidth - chamfer, y: halfHeight },
    { x: -halfWidth + chamfer, y: halfHeight },
    { x: -halfWidth, y: halfHeight - chamfer },
    { x: -halfWidth, y: -halfHeight + chamfer },
  ]
  const radians = (rotation * Math.PI) / 180
  return points.map((point) => ({
    x: x + point.x * Math.cos(radians) - point.y * Math.sin(radians),
    y: y + point.x * Math.sin(radians) + point.y * Math.cos(radians),
  }))
}
