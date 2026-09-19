import {
  AltiumArcRecord,
  AltiumDimensionRecord,
  AltiumFillRecord,
  AltiumPadRecord,
  type AltiumPcbDocument,
  type AltiumPoint,
  type AltiumRecord,
  AltiumRegionRecord,
  AltiumTextRecord,
  AltiumTrackRecord,
  AltiumViaRecord,
  getAltiumBounds,
  getPcbLayerStack,
  getPcbRegionGeometry,
  parseAltiumMeasurementToMils,
} from "altiumts"
import type {
  AnyCircuitElement,
  LayerRef,
  PCBKeepoutCircle,
  PcbBoard,
  PcbComponent,
  PcbCopperText,
  PcbCourtyardOutline,
  PcbCutout,
  PcbFabricationNoteDimension,
  PcbHole,
  PcbPlatedHole,
  PcbSilkscreenGraphic,
  PcbSilkscreenLine,
  PcbSilkscreenPath,
  PcbSilkscreenRect,
  PcbSilkscreenText,
  PcbSmtPad,
  PcbTrace,
  PcbVia,
} from "circuit-json"
import { convertAltiumCopperAreas } from "./pcb/convert-altium-copper-areas"
import {
  getAltiumPadGeometry,
  getAltiumPadHoleGeometry,
  getAltiumSlotHoleSize,
} from "./pcb/get-altium-pad-geometry"
import { getPreferredPcbBoardOutline } from "./pcb/get-board-outline"
import { mapAltiumCopperLayer } from "./pcb/map-altium-copper-layer"
import { stitchConnectedAltiumPaths } from "./pcb/stitch-connected-paths"

const MILS_TO_MILLIMETERS = 0.0254
const ALTIUM_SLOT_HOLE_TYPE = 2
const BOARD_ID = "pcb_board_altium"
const BOARD_GRAPHICS_COMPONENT_ID = "pcb_component_altium_board_graphics"
const ALTIUM_TEXT_ANCHORS: readonly PcbSilkscreenText["anchor_alignment"][] = [
  "top_left",
  "center_left",
  "bottom_left",
  "top_center",
  "center",
  "bottom_center",
  "top_right",
  "center_right",
  "bottom_right",
]

export interface ConvertAltiumPcbDocOptions {
  includeBoardOutline?: boolean
  includeComponents?: boolean
  includeCopperAreas?: boolean
  includeCourtyards?: boolean
  includeKeepouts?: boolean
  includeDimensions?: boolean
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

  if (
    options.includeCourtyards !== false &&
    options.includeComponents !== false
  ) {
    elements.push(...convertCourtyards(document))
  }

  if (options.includeCopperAreas !== false) {
    elements.push(...convertAltiumCopperAreas(document))
  }

  for (const [index, record] of document.records.entries()) {
    if (
      record instanceof AltiumArcRecord &&
      isKeepoutLayer(record.layer) &&
      options.includeKeepouts !== false
    ) {
      const keepout = convertCircularKeepout({
        record,
        recordIndex: index,
        document,
      })
      if (keepout) elements.push(keepout)
      continue
    }

    if (
      record instanceof AltiumDimensionRecord &&
      options.includeDimensions !== false
    ) {
      const dimension = convertDimension(record, index)
      if (dimension) elements.push(dimension)
      continue
    }

    if (record instanceof AltiumPadRecord && options.includePads !== false) {
      const pad = convertPad(record, index)
      if (pad) elements.push(pad)
      continue
    }

    if (record instanceof AltiumTrackRecord) {
      if (isCourtyardLayer(record.layer)) continue
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

    if (record instanceof AltiumArcRecord) {
      if (isCourtyardLayer(record.layer)) continue
      if (isOverlayLayer(record.layer)) {
        if (options.includeSilkscreen === false) continue
        const path = convertSilkscreenArc(record, index)
        if (path) elements.push(path)
      } else if (options.includeTraces !== false) {
        const trace = convertArcTrack(record, index)
        if (trace) elements.push(trace)
      }
      continue
    }

    if (record instanceof AltiumTextRecord) {
      if (isCourtyardLayer(record.layer)) continue
      if (isOverlayLayer(record.layer)) {
        if (options.includeSilkscreen === false) continue
        const text = convertSilkscreenText(record, index)
        if (text) elements.push(text)
      } else {
        const text = convertCopperText(record, index)
        if (text) elements.push(text)
      }
      continue
    }

    if (record instanceof AltiumRegionRecord) {
      if (record.regionKind === "POLYGON_CUTOUT") {
        if (options.includeBoardOutline !== false) {
          const cutout = convertRegionCutout(record, index)
          if (cutout) elements.push(cutout)
        }
        continue
      }
      if (isOverlayLayer(record.layer)) {
        if (options.includeSilkscreen === false) continue
        const graphic = convertSilkscreenRegion(record, index)
        if (graphic) elements.push(graphic)
        continue
      }
    }

    if (
      options.includeSilkscreen === false ||
      !isOverlayLayer(getLayer(record))
    ) {
      continue
    }

    if (record instanceof AltiumFillRecord) {
      const rect = convertSilkscreenFill(record, index)
      if (rect) elements.push(rect)
    }
  }

  return elements
}

function convertRegionCutout(
  record: AltiumRegionRecord,
  index: number,
): PcbCutout | undefined {
  if (
    record.recordKind !== "Region" ||
    record.regionKind !== "POLYGON_CUTOUT"
  ) {
    return undefined
  }

  const geometry = getPcbRegionGeometry(record)
  const points = geometry.outline.points.map(toMillimeterPoint)

  if (points.length < 3) return undefined

  return {
    type: "pcb_cutout",
    pcb_cutout_id: `pcb_cutout_altium_region_${index}`,
    pcb_board_id: BOARD_ID,
    shape: "polygon",
    points,
  }
}

function convertCircularKeepout({
  record,
  recordIndex,
  document,
}: {
  record: AltiumArcRecord
  recordIndex: number
  document: AltiumPcbDocument
}): PCBKeepoutCircle | undefined {
  const center = record.center
  const radiusMils = record.radiusMils
  const rawSweep = record.endAngle - record.startAngle
  const isFullCircle = rawSweep === 0 || Math.abs(rawSweep) >= 360
  if (!center || !radiusMils || !isFullCircle) return undefined

  return {
    type: "pcb_keepout",
    pcb_keepout_id: `pcb_keepout_altium_arc_${recordIndex}`,
    shape: "circle",
    center: toMillimeterPoint(center),
    radius: milsToMillimeters(radiusMils + (record.widthMils ?? 0) / 2),
    layers: getCopperLayers(document),
    description: "Altium circular keepout",
  }
}

function getCopperLayers(document: AltiumPcbDocument): LayerRef[] {
  if (!document.board) return ["top", "bottom"]
  const layers: LayerRef[] = getPcbLayerStack(document.board).entries.flatMap(
    (entry) => {
      const layer = mapAltiumCopperLayer(entry.name ?? entry.layerId)
      return layer ? [layer] : []
    },
  )
  return layers.length > 0 ? [...new Set(layers)] : ["top", "bottom"]
}

function convertDimension(
  record: AltiumDimensionRecord,
  index: number,
): PcbFabricationNoteDimension | undefined {
  const start = record.start
  const end = record.end
  if (!start || !end) return undefined

  const deltaX = end.x - start.x
  const deltaY = end.y - start.y
  const lengthMils = Math.hypot(deltaX, deltaY)
  if (lengthMils === 0) return undefined

  const perpendicular = {
    x: -deltaY / lengthMils,
    y: deltaX / lengthMils,
  }
  const lineAnchor = record.dimensionLineAnchor ?? start
  const signedOffsetMils =
    (lineAnchor.x - start.x) * perpendicular.x +
    (lineAnchor.y - start.y) * perpendicular.y
  const offsetSign = signedOffsetMils < 0 ? -1 : 1

  return {
    type: "pcb_fabrication_note_dimension",
    pcb_fabrication_note_dimension_id: `pcb_fabrication_note_dimension_altium_${index}`,
    pcb_component_id: BOARD_GRAPHICS_COMPONENT_ID,
    layer: mapMechanicalLayer(getLayer(record)),
    from: toMillimeterPoint(start),
    to: toMillimeterPoint(end),
    text: getDimensionText(record, lengthMils),
    offset_distance: milsToMillimeters(Math.abs(signedOffsetMils)),
    offset_direction: {
      x: perpendicular.x * offsetSign,
      y: perpendicular.y * offsetSign,
    },
    font: "tscircuit2024",
    font_size: milsToMillimeters(record.textHeightMils ?? 50),
    arrow_size: milsToMillimeters(getMeasurement(record, "ARROWSIZE") ?? 40),
    color: "#ec4899",
  }
}

function getDimensionText(
  record: AltiumDimensionRecord,
  measuredDistanceMils: number,
): string {
  const explicitText = record.getDecoded("TEXTFORMAT")?.trim()
  if (explicitText && explicitText !== "<>") return explicitText

  const precision = Math.min(Math.max(record.precision ?? 2, 0), 6)
  const normalizedUnit = record.unit?.toUpperCase() ?? "MILS"
  let amount = measuredDistanceMils
  let unitLabel = "mil"
  if (normalizedUnit.includes("MILLIMETER")) {
    amount *= MILS_TO_MILLIMETERS
    unitLabel = "mm"
  } else if (normalizedUnit.includes("CENTIMETER")) {
    amount *= MILS_TO_MILLIMETERS / 10
    unitLabel = "cm"
  } else if (normalizedUnit.includes("INCH")) {
    amount /= 1000
    unitLabel = "in"
  }
  return `${record.prefix ?? ""}${amount.toFixed(precision)}${record.suffix ?? ` ${unitLabel}`}`
}

function mapMechanicalLayer(layer: string | undefined): "top" | "bottom" {
  return normalizeLayer(layer).includes("BOTTOM") ? "bottom" : "top"
}

interface CourtyardPath {
  componentId: string
  layer: "top" | "bottom"
  points: AltiumPoint[]
  strokeWidthMils: number
}

function convertCourtyards(document: AltiumPcbDocument): PcbCourtyardOutline[] {
  const componentIds = new Map(
    document.components.flatMap((component, index) =>
      component.position ? [[component, componentId(index)] as const] : [],
    ),
  )
  const paths: CourtyardPath[] = []

  for (const record of document.records) {
    const layer = getLayer(record)
    if (!isCourtyardLayer(layer)) continue
    const component = document.getComponentForRecord(record)
    const ownedComponentId = component ? componentIds.get(component) : undefined
    if (!ownedComponentId) continue
    const points = getCourtyardRecordPoints(record)
    if (points.length < 2) continue
    paths.push({
      componentId: ownedComponentId,
      layer: mapCourtyardLayer(layer),
      points,
      strokeWidthMils:
        record instanceof AltiumTrackRecord || record instanceof AltiumArcRecord
          ? (record.widthMils ?? 4)
          : 0,
    })
  }

  const courtyards: PcbCourtyardOutline[] = []
  for (const path of stitchCourtyardPaths(paths)) {
    if (!isClosedAltiumPath(path.points)) continue
    const outline = removeClosingPoint(path.points).map(toMillimeterPoint)
    if (outline.length < 3) continue
    courtyards.push({
      type: "pcb_courtyard_outline",
      pcb_courtyard_outline_id: `pcb_courtyard_outline_altium_${courtyards.length}`,
      pcb_component_id: path.componentId,
      layer: path.layer,
      outline,
    })
  }
  return courtyards
}

function getCourtyardRecordPoints(record: AltiumRecord): AltiumPoint[] {
  if (record instanceof AltiumTrackRecord) {
    return record.start && record.end ? [record.start, record.end] : []
  }
  if (record instanceof AltiumArcRecord) {
    return record.center && record.radiusMils
      ? approximateArc({
          center: record.center,
          radius: record.radiusMils,
          startAngle: record.startAngle,
          endAngle: record.endAngle,
        })
      : []
  }
  if (record instanceof AltiumRegionRecord) {
    return getPcbRegionGeometry(record).outline.points
  }
  return []
}

function stitchCourtyardPaths(paths: CourtyardPath[]): CourtyardPath[] {
  const groups = new Map<string, CourtyardPath[]>()
  for (const path of deduplicateCourtyardPaths(paths)) {
    const key = [
      path.componentId,
      path.layer,
      path.strokeWidthMils.toFixed(4),
    ].join("|")
    const group = groups.get(key) ?? []
    group.push(path)
    groups.set(key, group)
  }
  return [...groups.values()].flatMap(stitchCourtyardPathGroup)
}

function stitchCourtyardPathGroup(group: CourtyardPath[]): CourtyardPath[] {
  const first = group[0]
  if (!first) return []
  return stitchConnectedAltiumPaths({
    paths: group.map((path) => path.points),
    maxEndpointGapMils: 0.01,
  }).map((points) => ({ ...first, points }))
}

function deduplicateCourtyardPaths(paths: CourtyardPath[]): CourtyardPath[] {
  const signatures = new Set<string>()
  return paths.filter((path) => {
    const forwardPoints = path.points.map(formatAltiumPoint).join("|")
    const reversePoints = path.points
      .toReversed()
      .map(formatAltiumPoint)
      .join("|")
    const pointsSignature =
      forwardPoints < reversePoints ? forwardPoints : reversePoints
    const signature = [
      path.componentId,
      path.layer,
      path.strokeWidthMils.toFixed(4),
      pointsSignature,
    ].join("|")
    if (signatures.has(signature)) return false
    signatures.add(signature)
    return true
  })
}

function formatAltiumPoint(point: AltiumPoint): string {
  return `${point.x.toFixed(4)},${point.y.toFixed(4)}`
}

function isClosedAltiumPath(points: AltiumPoint[]): boolean {
  const first = points[0]
  const last = points.at(-1)
  return Boolean(first && last && altiumPointsApproximatelyEqual(first, last))
}

function removeClosingPoint(points: AltiumPoint[]): AltiumPoint[] {
  const first = points[0]
  const last = points.at(-1)
  return first && last && altiumPointsApproximatelyEqual(first, last)
    ? points.slice(0, -1)
    : points
}

function altiumPointsApproximatelyEqual(
  left: AltiumPoint,
  right: AltiumPoint,
): boolean {
  return (
    Math.abs(left.x - right.x) <= 0.01 && Math.abs(left.y - right.y) <= 0.01
  )
}

function createBoard(document: AltiumPcbDocument): PcbBoard {
  const altiumOutline = getPreferredPcbBoardOutline(document)
  const outline = altiumOutline.map(toMillimeterPoint)
  const bounds =
    getAltiumBounds(altiumOutline) ?? getFallbackPcbBounds(document.records)
  const width = Math.max(milsToMillimeters(bounds.maxX - bounds.minX), 0.1)
  const height = Math.max(milsToMillimeters(bounds.maxY - bounds.minY), 0.1)
  const numLayers = document.board
    ? Math.max(
        getPcbLayerStack(document.board).entries.filter((entry) =>
          Boolean(mapAltiumCopperLayer(entry.name ?? entry.layerId)),
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
  const layer = mapAltiumCopperLayer(record.layer)
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

function convertArcTrack(
  record: AltiumArcRecord,
  index: number,
): PcbTrace | undefined {
  if (!record.center || !record.radiusMils) return undefined
  const layer = mapAltiumCopperLayer(record.layer)
  if (!layer) return undefined
  const width = milsToMillimeters(record.widthMils ?? 4)
  const points = approximateArc({
    center: record.center,
    radius: record.radiusMils,
    startAngle: record.startAngle,
    endAngle: record.endAngle,
  })

  return {
    type: "pcb_trace",
    pcb_trace_id: `pcb_trace_altium_arc_${index}`,
    should_round_corners: true,
    route: points.map((point) => ({
      route_type: "wire",
      ...toMillimeterPoint(point),
      width,
      layer,
    })),
  }
}

function convertCopperText(
  record: AltiumTextRecord,
  index: number,
): PcbCopperText | undefined {
  const text =
    decodeAltiumWideString(record.getDecoded("WIDESTRING")) ||
    record.getDecoded("TEXT") ||
    record.text
  if (!record.position || !text) return undefined
  const layer = mapAltiumCopperLayer(record.layer)
  if (!layer) return undefined
  return {
    type: "pcb_copper_text",
    pcb_copper_text_id: `pcb_copper_text_altium_${index}`,
    pcb_component_id: pcbComponentIdForRecord(record),
    text,
    font: "tscircuit2024",
    font_size: milsToMillimeters(record.heightMils ?? 30),
    anchor_position: toMillimeterPoint(record.position),
    anchor_alignment: mapTextAnchor(record.justification),
    ccw_rotation: record.rotation,
    layer,
    is_mirrored: record.mirrored,
  }
}

function convertVia(
  record: AltiumViaRecord,
  index: number,
): PcbVia | undefined {
  if (!record.position) return undefined
  const startLayer = mapAltiumCopperLayer(record.startLayer) ?? "top"
  const endLayer = mapAltiumCopperLayer(record.endLayer) ?? "bottom"
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
  const geometry = getAltiumPadGeometry(record)
  if (!position || !geometry) return undefined
  const x = milsToMillimeters(position.x)
  const y = milsToMillimeters(position.y)
  const width = milsToMillimeters(geometry.widthMils)
  const height = milsToMillimeters(geometry.heightMils)
  const cornerRadius =
    geometry.cornerRadiusMils === undefined
      ? undefined
      : milsToMillimeters(geometry.cornerRadiusMils)
  const holeDiameter = milsToMillimeters(record.holeSizeMils ?? 0)
  const shape = normalizeShape(geometry.shape)
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
    const holeGeometry = getAltiumPadHoleGeometry(record)
    const holeOffsetX = milsToMillimeters(holeGeometry.offsetXMils)
    const holeOffsetY = milsToMillimeters(holeGeometry.offsetYMils)
    const slotLengthMils = getMeasurement(record, "SLOTLENGTH")
    const holeWidthMils = record.holeWidthMils ?? record.holeSizeMils
    const isSlot =
      record.getNumber("HOLETYPE") === ALTIUM_SLOT_HOLE_TYPE ||
      normalizeShape(record.holeType).includes("SLOT") ||
      (slotLengthMils ?? 0) > (record.holeSizeMils ?? 0) ||
      (holeWidthMils ?? 0) > (record.holeSizeMils ?? 0)
    const layers: LayerRef[] = ["top", "bottom"]

    if (isSlot) {
      const slotHoleSize = getAltiumSlotHoleSize(record)
      const holeWidth = milsToMillimeters(slotHoleSize.widthMils)
      const holeHeight = milsToMillimeters(slotHoleSize.heightMils)
      if (isRectangularShape(shape)) {
        const rotated =
          holeGeometry.ccwRotationDegrees !== 0 || record.rotation !== 0
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
          ...(rotated
            ? { hole_ccw_rotation: holeGeometry.ccwRotationDegrees }
            : {}),
          rect_pad_width: width,
          rect_pad_height: height,
          rect_border_radius: cornerRadius,
          ...(rotated ? { rect_ccw_rotation: record.rotation } : {}),
          hole_offset_x: holeOffsetX,
          hole_offset_y: holeOffsetY,
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
        ccw_rotation: holeGeometry.ccwRotationDegrees,
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
        rect_border_radius: cornerRadius,
        rect_ccw_rotation: record.rotation,
        hole_offset_x: holeOffsetX,
        hole_offset_y: holeOffsetY,
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
        pad_outline: createOctagonPoints({
          x,
          y,
          width,
          height,
          rotation: record.rotation,
        }),
        hole_offset_x: holeOffsetX,
        hole_offset_y: holeOffsetY,
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

  const layer = mapAltiumCopperLayer(record.layer)
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
      points: createOctagonPoints({
        x,
        y,
        width,
        height,
        rotation: record.rotation,
      }),
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
  const points = approximateArc({
    center: record.center,
    radius: record.radiusMils,
    startAngle: record.startAngle,
    endAngle: record.endAngle,
  })
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

function convertSilkscreenRegion(
  record: AltiumRegionRecord,
  index: number,
): PcbSilkscreenGraphic | undefined {
  const geometry = getPcbRegionGeometry(record)
  const outerVertices = geometry.outline.points.map(toMillimeterPoint)
  if (outerVertices.length < 3) return undefined

  const innerRings = geometry.holes
    .map((hole) => ({ vertices: hole.points.map(toMillimeterPoint) }))
    .filter((ring) => ring.vertices.length >= 3)

  return {
    type: "pcb_silkscreen_graphic",
    pcb_silkscreen_graphic_id: `pcb_silkscreen_graphic_altium_region_${index}`,
    pcb_component_id: pcbComponentIdForRecord(record),
    shape: "brep",
    brep_shape: {
      outer_ring: { vertices: outerVertices },
      inner_rings: innerRings,
    },
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
): PcbSilkscreenText["anchor_alignment"] {
  const numericAnchor = ALTIUM_TEXT_ANCHORS[Number(justification) - 1]
  if (numericAnchor) return numericAnchor

  const normalized = justification?.replace(/[\s_-]+/gu, "").toUpperCase()
  if (normalized?.includes("CENTER")) return "bottom_center"
  if (normalized?.includes("RIGHT")) return "bottom_right"
  if (normalized?.includes("LEFT")) return "bottom_left"
  return "center"
}

function isOverlayLayer(layer: string | undefined): boolean {
  const normalized = normalizeLayer(layer)
  return normalized === "TOPOVERLAY" || normalized === "BOTTOMOVERLAY"
}

function isKeepoutLayer(layer: string | undefined): boolean {
  return normalizeLayer(layer) === "KEEPOUT"
}

function isCourtyardLayer(layer: string | undefined): boolean {
  const normalized = normalizeLayer(layer)
  return normalized === "MECHANICAL15" || normalized === "MECHANICAL16"
}

function mapCourtyardLayer(layer: string | undefined): "top" | "bottom" {
  return normalizeLayer(layer) === "MECHANICAL16" ? "bottom" : "top"
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

function approximateArc({
  center,
  radius,
  startAngle,
  endAngle,
}: {
  center: AltiumPoint
  radius: number
  startAngle: number
  endAngle: number
}): AltiumPoint[] {
  const sweep = (endAngle - startAngle + 360) % 360 || 360
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

function createOctagonPoints({
  x,
  y,
  width,
  height,
  rotation,
}: {
  x: number
  y: number
  width: number
  height: number
  rotation: number
}): Array<{ x: number; y: number }> {
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
