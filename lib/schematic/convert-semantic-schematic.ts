import {
  type AltiumPoint,
  type AltiumRecord,
  type AltiumSchDoc,
  getSchematicDocumentIndex,
  getSchematicRecordPoints,
} from "altiumts"
import {
  type AnyCircuitElement,
  type SchematicComponent,
  type SchematicNetLabel,
  type SchematicPort,
  type SchematicText,
  type SchematicTrace,
  type SourceComponentBase,
  type SourceNet,
  type SourcePort,
  type SourceTrace,
  source_simple_capacitor,
  source_simple_crystal,
  source_simple_inductor,
  source_simple_mosfet,
  source_simple_resistor,
} from "circuit-json"
import { parseAndConvertSiUnit } from "format-si-unit"
import { type SchSymbol, symbols } from "schematic-symbols"

export interface SemanticSchematicOptions {
  includeHidden?: boolean
  includeText?: boolean
  scale: number
  schematicSheetId: string
}

export interface SemanticSchematicConversion {
  elements: AnyCircuitElement[]
  handledRecords: Set<AltiumRecord>
}

interface ConvertedPort {
  isSchematicVisible: boolean
  point: AltiumPoint
  record: AltiumRecord
  schematicPort: SchematicPort
  sourcePort: SourcePort
}

interface SymbolPortAssignment {
  convertedPort: ConvertedPort
  symbolPort: SchSymbol["ports"][number]
}

interface SymbolSelection {
  assignments: SymbolPortAssignment[]
  name: string
  symbol: SchSymbol
}

interface SemanticNet {
  id: string
  names: string[]
  points: AltiumPoint[]
  records: AltiumRecord[]
}

interface SemanticNetGraph {
  getConnectedWiresForRecord(record: AltiumRecord): AltiumRecord[]
  nets: SemanticNet[]
}

interface Bounds {
  maxX: number
  maxY: number
  minX: number
  minY: number
}

interface SchematicSegment {
  end: AltiumPoint
  start: AltiumPoint
}

type CardinalDirection = "up" | "down" | "left" | "right"

const DIRECTION_BY_ORIENTATION: readonly CardinalDirection[] = [
  "right",
  "up",
  "left",
  "down",
]

const VECTOR_BY_DIRECTION: Readonly<Record<CardinalDirection, AltiumPoint>> = {
  down: { x: 0, y: -1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: 1 },
}

const CARDINAL_DIRECTIONS: readonly CardinalDirection[] = [
  "right",
  "up",
  "left",
  "down",
]

const SYMBOL_CATALOG = symbols as Record<string, SchSymbol | undefined>
const SYMBOL_NAMES = Object.keys(SYMBOL_CATALOG)
const INLINE_NET_LABEL_COLOR = "rgb(132, 0, 0)"
const DEFAULT_INLINE_NET_LABEL_FONT_SIZE = 0.18
const MIN_INLINE_NET_LABEL_FONT_SIZE = 0.1
const INLINE_NET_LABEL_CHARACTER_WIDTH = 0.12
const INLINE_NET_LABEL_HORIZONTAL_PADDING = 0.12

/**
 * Converts records that have native Circuit JSON semantics before the
 * primitive fallback runs. This deliberately favors Circuit JSON's component,
 * port, trace, net, and symbol model over reproducing Altium's drawing style.
 */
export function convertSemanticSchematic(
  document: AltiumSchDoc,
  options: SemanticSchematicOptions,
): SemanticSchematicConversion {
  const handledRecords = new Set<AltiumRecord>()
  const elements: AnyCircuitElement[] = []
  const convertedPorts: ConvertedPort[] = []

  convertComponents({
    convertedPorts,
    document,
    elements,
    handledRecords,
    options,
  })

  const semanticNetGraph = buildSemanticNetGraph(document, convertedPorts)

  const connectivity = convertConnectivity({
    convertedPorts,
    document,
    elements,
    handledRecords,
    semanticNetGraph,
    options,
  })

  convertNetLabels({
    connectivity,
    document,
    elements,
    handledRecords,
    semanticNetGraph,
    options,
  })

  return { elements, handledRecords }
}

function convertComponents(params: {
  convertedPorts: ConvertedPort[]
  document: AltiumSchDoc
  elements: AnyCircuitElement[]
  handledRecords: Set<AltiumRecord>
  options: SemanticSchematicOptions
}): void {
  const { convertedPorts, document, elements, handledRecords, options } = params
  const documentIndex = getSchematicDocumentIndex(document)
  const sourceComponentIdByDesignator = new Map<string, string>()

  for (const [componentIndex, componentRecord] of document.records.entries()) {
    if (componentRecord.recordKind !== "1") continue
    handledRecords.add(componentRecord)

    const ownedRecords = documentIndex.getOwnedRecords(componentRecord)
    for (const ownedRecord of ownedRecords) handledRecords.add(ownedRecord)

    const currentPartId = componentRecord.getNumber("CURRENTPARTID") ?? 1
    const visibleOwnedRecords = ownedRecords.filter((record) =>
      isOwnedRecordVisible(record, currentPartId),
    )
    const pins = visibleOwnedRecords.filter(
      (record) =>
        record.recordKind === "2" &&
        (!isPinHidden(record) || options.includeHidden === true),
    )
    if (pins.length === 0) continue
    const visibleSymbolLabels = new Set(
      visibleOwnedRecords
        .filter((record) => record.recordKind === "4")
        .flatMap((record) => {
          const text = record.getDecoded("TEXT")?.trim().toUpperCase()
          return text ? [text] : []
        }),
    )

    const designator =
      findOwnedText(ownedRecords, "34", "Designator") ??
      componentRecord.getDecoded("DESIGNATOR") ??
      `U${componentIndex}`
    // Altium libraries commonly store the human-readable component value in
    // the named `Value` parameter, while `Comment` may contain a manufacturer
    // part number (or another library-specific description). Prefer the
    // explicit value field and retain the older fallbacks for simpler files.
    const value =
      findOwnedText(ownedRecords, "41", "Value")?.trim() ||
      findOwnedText(ownedRecords, "41", "Comment")?.trim() ||
      componentRecord.getDecoded("COMMENT")?.trim() ||
      componentRecord.getDecoded("DESIGNITEMID")?.trim() ||
      componentRecord.getDecoded("LIBREFERENCE")?.trim() ||
      ""
    const libraryReference =
      componentRecord.getDecoded("LIBREFERENCE") ??
      componentRecord.getDecoded("DESIGNITEMID") ??
      designator
    const manufacturerPartNumber = findOwnedText(
      ownedRecords,
      "41",
      "Mfr_part_number",
    )
    const normalizedDesignator = designator.trim().toUpperCase()
    const existingSourceComponentId =
      sourceComponentIdByDesignator.get(normalizedDesignator)
    const sourceComponentId =
      existingSourceComponentId ?? `source_component_altium_${componentIndex}`
    const schematicComponentId = `schematic_component_altium_${componentIndex}`
    if (!existingSourceComponentId) {
      sourceComponentIdByDesignator.set(normalizedDesignator, sourceComponentId)
      elements.push(
        createSourceComponent({
          designator,
          libraryReference,
          manufacturerPartNumber,
          pinCount: pins.length,
          sourceComponentId,
          value,
        }),
      )
    }

    const componentPorts = pins.map((pin, pinIndex) =>
      convertComponentPin({
        document,
        options,
        pin,
        pinIndex,
        schematicComponentId,
        sourceComponentId,
        visibleSymbolLabels,
      }),
    )
    const bodyBounds = getComponentBodyBounds(
      visibleOwnedRecords,
      componentPorts.map(({ point }) => point),
    )
    const symbolSelection = selectCircuitJsonSymbol({
      designator,
      libraryReference,
      ports: componentPorts,
    })
    const center = scalePoint(getBoundsCenter(bodyBounds), options.scale)
    const size = symbolSelection
      ? { ...symbolSelection.symbol.size }
      : {
          height: Math.max(
            (bodyBounds.maxY - bodyBounds.minY) * options.scale,
            0.4,
          ),
          width: Math.max(
            (bodyBounds.maxX - bodyBounds.minX) * options.scale,
            0.4,
          ),
        }
    if (symbolSelection) {
      applyNativeSymbolPortGeometry({
        center,
        selection: symbolSelection,
      })
    }
    convertedPorts.push(...componentPorts)
    elements.push(
      ...componentPorts.flatMap(
        ({ isSchematicVisible, sourcePort, schematicPort }) => [
          sourcePort,
          ...(isSchematicVisible ? [schematicPort] : []),
        ],
      ),
    )
    const schematicComponent: SchematicComponent = {
      type: "schematic_component",
      center,
      // circuit-to-svg uses this flag as the renderable component gate for
      // both generated boxes and components selected by symbol_name.
      is_box_with_pins: true,
      schematic_component_id: schematicComponentId,
      schematic_sheet_id: options.schematicSheetId,
      size,
      source_component_id: sourceComponentId,
      symbol_display_value: value,
      ...(symbolSelection ? { symbol_name: symbolSelection.name } : {}),
    }
    elements.push(schematicComponent)

    if (!symbolSelection && options.includeText !== false) {
      elements.push(
        createComponentText({
          anchor: "bottom_left",
          component: schematicComponent,
          id: `schematic_component_designator_altium_${componentIndex}`,
          position: {
            x: center.x - size.width / 2,
            y: center.y + size.height / 2 + 0.13,
          },
          text: designator,
        }),
      )
      if (value) {
        elements.push(
          createComponentText({
            anchor: "top_left",
            component: schematicComponent,
            id: `schematic_component_value_altium_${componentIndex}`,
            position: {
              x: center.x - size.width / 2,
              y: center.y - size.height / 2 - 0.13,
            },
            text: value,
          }),
        )
      }
    }
  }
}

function convertComponentPin(params: {
  document: AltiumSchDoc
  options: SemanticSchematicOptions
  pin: AltiumRecord
  pinIndex: number
  schematicComponentId: string
  sourceComponentId: string
  visibleSymbolLabels: Set<string>
}): ConvertedPort {
  const {
    document,
    options,
    pin,
    pinIndex,
    schematicComponentId,
    sourceComponentId,
    visibleSymbolLabels,
  } = params
  const recordIndex = document.records.indexOf(pin)
  const pinConglomerate = pin.getNumber("PINCONGLOMERATE")
  const orientation = (pinConglomerate ?? pin.getNumber("ORIENTATION") ?? 0) & 3
  const direction = DIRECTION_BY_ORIENTATION[orientation] ?? "right"
  const directionVector = VECTOR_BY_DIRECTION[direction]
  const location = getLocation(pin) ?? { x: 0, y: 0 }
  const pinLength = Math.max(pin.getNumber("PINLENGTH") ?? 10, 0)
  const terminalPoint = {
    x: location.x + directionVector.x * pinLength,
    y: location.y + directionVector.y * pinLength,
  }
  const designator = pin.getDecoded("DESIGNATOR") ?? `${pinIndex + 1}`
  const pinNumber = parsePinNumber(designator)
  const name = pin.getDecoded("NAME") ?? designator
  const sourcePortId = `source_port_altium_${recordIndex}`
  const schematicPortId = `schematic_port_altium_${recordIndex}`
  const sourcePort: SourcePort = {
    type: "source_port",
    name,
    port_hints: uniqueStrings([
      designator,
      name,
      pinNumber === undefined ? undefined : `pin${pinNumber}`,
    ]),
    source_component_id: sourceComponentId,
    source_port_id: sourcePortId,
    ...(pinNumber === undefined ? {} : { pin_number: pinNumber }),
  }
  const electricalType = pin.getNumber("ELECTRICAL")
  const normalizedName = name.trim().toUpperCase()
  const functionalName = normalizedName.replace(/\d+$/u, "")
  const showName =
    pinConglomerate === undefined ||
    (pinConglomerate & 0x08) !== 0 ||
    visibleSymbolLabels.has(normalizedName) ||
    visibleSymbolLabels.has(functionalName)
  const schematicPort: SchematicPort = {
    type: "schematic_port",
    center: scalePoint(terminalPoint, options.scale),
    ...(showName && name ? { display_pin_label: name } : {}),
    distance_from_component_edge: pinLength * options.scale,
    facing_direction: direction,
    is_connected: false,
    schematic_component_id: schematicComponentId,
    schematic_port_id: schematicPortId,
    schematic_sheet_id: options.schematicSheetId,
    side_of_component: directionToSide(direction),
    source_port_id: sourcePortId,
    true_ccw_index: pinIndex,
    ...(pinNumber === undefined ? {} : { pin_number: pinNumber }),
    ...(electricalType === 0 || electricalType === 1
      ? { has_input_arrow: true }
      : {}),
    ...(electricalType === 1 || electricalType === 2
      ? { has_output_arrow: true }
      : {}),
  }
  return {
    isSchematicVisible: true,
    point: terminalPoint,
    record: pin,
    schematicPort,
    sourcePort,
  }
}

function createSourceComponent(params: {
  designator: string
  libraryReference: string
  manufacturerPartNumber?: string
  pinCount: number
  sourceComponentId: string
  value: string
}): AnyCircuitElement {
  const {
    designator,
    libraryReference,
    manufacturerPartNumber,
    pinCount,
    sourceComponentId,
    value,
  } = params
  const classification = classifyComponent({ designator, libraryReference })
  const primaryValue = getPrimaryComponentValue(value)
  const common = {
    type: "source_component" as const,
    display_name: designator,
    display_value: value || undefined,
    manufacturer_part_number: manufacturerPartNumber,
    name: designator,
    source_component_id: sourceComponentId,
  }

  if (classification === "resistor") {
    const parsed = source_simple_resistor.safeParse({
      ...common,
      display_resistance: value || undefined,
      ftype: "simple_resistor",
      resistance: primaryValue || 0,
    })
    if (parsed.success) return parsed.data
  }
  if (classification === "capacitor") {
    const parsed = source_simple_capacitor.safeParse({
      ...common,
      display_capacitance: value || undefined,
      ftype: "simple_capacitor",
      capacitance: primaryValue || 0,
    })
    if (parsed.success) return parsed.data
  }
  if (classification === "inductor") {
    const parsed = source_simple_inductor.safeParse({
      ...common,
      display_inductance: value || undefined,
      ftype: "simple_inductor",
      inductance: primaryValue || 0,
    })
    if (parsed.success) return parsed.data
  }
  if (classification === "crystal" && (pinCount === 2 || pinCount === 4)) {
    const frequency = parseAndConvertSiUnit(value, "Hz").value
    if (typeof frequency === "number" && Number.isFinite(frequency)) {
      const parsed = source_simple_crystal.safeParse({
        ...common,
        frequency,
        ftype: "simple_crystal",
        pin_variant: pinCount === 4 ? "four_pin" : "two_pin",
      })
      if (parsed.success) return parsed.data
    }
  }
  if (classification === "mosfet" && pinCount >= 3) {
    const parsed = source_simple_mosfet.safeParse({
      ...common,
      ...getMosfetVariant(libraryReference),
      ftype: "simple_mosfet",
    })
    if (parsed.success) return parsed.data
  }

  const ftype:
    | "simple_chip"
    | "simple_diode"
    | "simple_led"
    | "simple_test_point" =
    classification === "diode"
      ? "simple_diode"
      : classification === "led"
        ? "simple_led"
        : classification === "testpoint"
          ? "simple_test_point"
          : "simple_chip"
  return {
    ...common,
    ftype,
  } satisfies SourceComponentBase
}

function createComponentText(params: {
  anchor: SchematicText["anchor"]
  component: SchematicComponent
  id: string
  position: AltiumPoint
  text: string
}): SchematicText {
  const { anchor, component, id, position, text } = params
  return {
    type: "schematic_text",
    anchor,
    color: "#006464",
    font_size: 0.18,
    position,
    rotation: 0,
    schematic_component_id: component.schematic_component_id,
    schematic_sheet_id: component.schematic_sheet_id,
    schematic_text_id: id,
    text,
  }
}

/**
 * Altium permits labels and pin hot spots to land anywhere on a wire segment,
 * not only on declared polyline vertices. Build the electrical graph with
 * those geometric joins so Circuit JSON source traces carry the real ports and
 * net names. Mid-segment crossings remain disconnected unless one wire has a
 * vertex there or Altium emits an explicit junction record.
 */
function buildSemanticNetGraph(
  document: AltiumSchDoc,
  convertedPorts: ConvertedPort[],
): SemanticNetGraph {
  const disjointSet = new PointDisjointSet()
  const pointValues = new Map<string, AltiumPoint>()
  const wireRecords = document.records.filter(
    (record) => record.recordKind === "27",
  )
  const segments: SchematicSegment[] = []

  for (const wire of wireRecords) {
    const points = getSchematicRecordPoints(wire)
    for (const point of points) {
      addGraphPoint(disjointSet, pointValues, point)
    }
    for (let index = 1; index < points.length; index++) {
      const start = points[index - 1]
      const end = points[index]
      if (!start || !end) continue
      disjointSet.union(pointKey(start), pointKey(end))
      segments.push({ end, start })
    }
  }

  const positionedRecords = document.records.flatMap((record) => {
    if (!["4", "17", "18", "25", "29"].includes(record.recordKind ?? "")) {
      return []
    }
    const point =
      record.recordKind === "18"
        ? getPortConnectionGeometry(record, segments)?.anchor
        : getLocation(record)
    return point ? [{ point, record }] : []
  })
  const positionedPins = convertedPorts.map(({ point, record }) => ({
    point,
    record,
  }))
  const joinPoints = [
    ...new Map(
      wireRecords
        .flatMap((wire) => getSchematicRecordPoints(wire))
        .map((point) => [pointKey(point), point]),
    ).values(),
    ...positionedRecords.map(({ point }) => point),
    ...positionedPins.map(({ point }) => point),
  ]

  for (const point of joinPoints) {
    addGraphPoint(disjointSet, pointValues, point)
    for (const segment of segments) {
      if (isPointOnSegment(point, segment.start, segment.end)) {
        disjointSet.union(pointKey(point), pointKey(segment.start))
      }
    }
  }

  interface MutableSemanticNet {
    id: string
    names: Set<string>
    points: Map<string, AltiumPoint>
    records: Set<AltiumRecord>
  }
  const groupedByRoot = new Map<string, MutableSemanticNet>()
  const getGroup = (point: AltiumPoint): MutableSemanticNet => {
    const root = disjointSet.find(pointKey(point))
    const existing = groupedByRoot.get(root)
    if (existing) return existing
    const created: MutableSemanticNet = {
      id: root,
      names: new Set(),
      points: new Map(),
      records: new Set(),
    }
    groupedByRoot.set(root, created)
    return created
  }

  for (const point of pointValues.values()) {
    getGroup(point).points.set(pointKey(point), point)
  }
  for (const wire of wireRecords) {
    const firstPoint = getSchematicRecordPoints(wire)[0]
    if (firstPoint) getGroup(firstPoint).records.add(wire)
  }
  for (const { point, record } of [...positionedRecords, ...positionedPins]) {
    const group = getGroup(point)
    group.records.add(record)
    const name = getElectricalRecordName(record)
    if (name) group.names.add(name)
  }

  const connectedWiresByRecord = new Map<AltiumRecord, AltiumRecord[]>()
  for (const group of groupedByRoot.values()) {
    const wires = [...group.records].filter(
      (record) => record.recordKind === "27",
    )
    for (const record of group.records) {
      connectedWiresByRecord.set(record, wires)
    }
  }

  const mergedGroups: MutableSemanticNet[] = []
  for (const group of groupedByRoot.values()) {
    if (group.records.size === 0) continue
    const normalizedNames = new Set(
      [...group.names].map((name) => name.trim().toUpperCase()),
    )
    const matches = mergedGroups.filter((candidate) =>
      [...candidate.names].some((name) =>
        normalizedNames.has(name.trim().toUpperCase()),
      ),
    )
    if (matches.length === 0 || normalizedNames.size === 0) {
      mergedGroups.push(group)
      continue
    }
    const target = matches[0]
    if (!target) continue
    mergeSemanticNetGroup(target, group)
    for (const duplicate of matches.slice(1)) {
      mergeSemanticNetGroup(target, duplicate)
      const duplicateIndex = mergedGroups.indexOf(duplicate)
      if (duplicateIndex >= 0) mergedGroups.splice(duplicateIndex, 1)
    }
  }

  const nets: SemanticNet[] = mergedGroups.map((group) => ({
    id: group.id,
    names: [...group.names],
    points: [...group.points.values()],
    records: [...group.records],
  }))
  return {
    getConnectedWiresForRecord: (record) =>
      connectedWiresByRecord.get(record) ?? [],
    nets,
  }
}

function addGraphPoint(
  disjointSet: PointDisjointSet,
  pointValues: Map<string, AltiumPoint>,
  point: AltiumPoint,
): void {
  const key = pointKey(point)
  disjointSet.add(key)
  pointValues.set(key, point)
}

function getElectricalRecordName(record: AltiumRecord): string | undefined {
  if (record.recordKind === "18") return record.getDecoded("NAME")
  if (["4", "17", "25"].includes(record.recordKind ?? "")) {
    return record.getDecoded("TEXT")
  }
  return undefined
}

function mergeSemanticNetGroup(
  target: {
    names: Set<string>
    points: Map<string, AltiumPoint>
    records: Set<AltiumRecord>
  },
  source: {
    names: Set<string>
    points: Map<string, AltiumPoint>
    records: Set<AltiumRecord>
  },
): void {
  for (const name of source.names) target.names.add(name)
  for (const [key, point] of source.points) target.points.set(key, point)
  for (const record of source.records) target.records.add(record)
}

function isPointOnSegment(
  point: AltiumPoint,
  start: AltiumPoint,
  end: AltiumPoint,
): boolean {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const cross = (point.x - start.x) * dy - (point.y - start.y) * dx
  const tolerance = 0.000001 * Math.max(Math.abs(dx), Math.abs(dy), 1)
  if (Math.abs(cross) > tolerance) return false
  const dot = (point.x - start.x) * dx + (point.y - start.y) * dy
  if (dot < -tolerance) return false
  const lengthSquared = dx * dx + dy * dy
  return dot <= lengthSquared + tolerance
}

function splitSegmentAtPoints(
  start: AltiumPoint,
  end: AltiumPoint,
  candidates: AltiumPoint[],
): AltiumPoint[] {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return [start]

  const pointsByKey = new Map<string, AltiumPoint>([
    [pointKey(start), start],
    [pointKey(end), end],
  ])
  for (const candidate of candidates) {
    if (isPointOnSegment(candidate, start, end)) {
      pointsByKey.set(pointKey(candidate), candidate)
    }
  }
  return [...pointsByKey.values()].sort((left, right) => {
    const leftDistance = (left.x - start.x) * dx + (left.y - start.y) * dy
    const rightDistance = (right.x - start.x) * dx + (right.y - start.y) * dy
    return leftDistance - rightDistance
  })
}

class PointDisjointSet {
  private readonly parent = new Map<string, string>()

  add(value: string): void {
    if (!this.parent.has(value)) this.parent.set(value, value)
  }

  find(value: string): string {
    this.add(value)
    const parent = this.parent.get(value) ?? value
    if (parent === value) return value
    const root = this.find(parent)
    this.parent.set(value, root)
    return root
  }

  union(left: string, right: string): void {
    const leftRoot = this.find(left)
    const rightRoot = this.find(right)
    if (leftRoot !== rightRoot) this.parent.set(rightRoot, leftRoot)
  }
}

interface ConnectivityConversion {
  sourceNetIdByRecord: Map<AltiumRecord, string>
  sourceNetIdByName: Map<string, string>
  sourcePortCountByRecord: Map<AltiumRecord, number>
  sourceTraceIdByRecord: Map<AltiumRecord, string>
  schematicTraceIdByRecord: Map<AltiumRecord, string>
}

function convertConnectivity(params: {
  convertedPorts: ConvertedPort[]
  document: AltiumSchDoc
  elements: AnyCircuitElement[]
  handledRecords: Set<AltiumRecord>
  options: SemanticSchematicOptions
  semanticNetGraph: SemanticNetGraph
}): ConnectivityConversion {
  const {
    convertedPorts,
    document,
    elements,
    handledRecords,
    options,
    semanticNetGraph: graph,
  } = params
  const sourceNetIdByName = new Map<string, string>()
  const sourceNetIdByRecord = new Map<AltiumRecord, string>()
  const sourcePortCountByRecord = new Map<AltiumRecord, number>()
  const sourceTraceIdByRecord = new Map<AltiumRecord, string>()
  const schematicTraceIdByRecord = new Map<AltiumRecord, string>()
  const portsByPoint = groupByPoint(convertedPorts)

  for (const [netIndex, net] of graph.nets.entries()) {
    const wires = net.records.filter((record) => record.recordKind === "27")
    const connectedConvertedPorts = uniqueConvertedPorts(
      net.points.flatMap((point) => portsByPoint.get(pointKey(point)) ?? []),
    )
    const connectedPorts = connectedConvertedPorts.map(
      ({ sourcePort }) => sourcePort.source_port_id,
    )
    if (
      wires.length === 0 &&
      !(
        (net.names.length > 0 && connectedPorts.length > 0) ||
        connectedPorts.length > 1
      )
    ) {
      continue
    }
    const sourceNetIds = net.names.map((name) =>
      getOrCreateSourceNet({
        elements,
        name,
        sourceNetIdByName,
      }),
    )
    for (const record of net.records) {
      const firstSourceNetId = sourceNetIds[0]
      if (firstSourceNetId) sourceNetIdByRecord.set(record, firstSourceNetId)
    }

    const sourceTraceId = `source_trace_altium_${netIndex}`
    for (const record of net.records) {
      sourcePortCountByRecord.set(record, connectedPorts.length)
      sourceTraceIdByRecord.set(record, sourceTraceId)
    }
    const sourceTrace: SourceTrace = {
      type: "source_trace",
      connected_source_net_ids: sourceNetIds,
      connected_source_port_ids: connectedPorts,
      display_name: net.names[0],
      name: net.names[0],
      source_trace_id: sourceTraceId,
    }
    elements.push(sourceTrace)

    const netJunctions = document.records
      .filter(
        (record) =>
          record.recordKind === "29" &&
          net.points.some((point) => pointsEqual(point, getLocation(record))),
      )
      .flatMap((record) => {
        handledRecords.add(record)
        const location = getLocation(record)
        return location ? [scalePoint(location, options.scale)] : []
      })

    for (const wire of wires) handledRecords.add(wire)
    const prunedSegmentKeys = getEquivalentPortPrunedSegmentKeys({
      convertedPorts: connectedConvertedPorts,
      net,
      wires,
    })
    let renderedWireIndex = 0
    for (const wire of wires) {
      const wireRecordIndex = document.records.indexOf(wire)
      const schematicTraceId = `schematic_trace_altium_${wireRecordIndex}`
      const points = getSchematicRecordPoints(wire)
      const edges: SchematicTrace["edges"] = []
      for (let pointIndex = 1; pointIndex < points.length; pointIndex++) {
        const from = points[pointIndex - 1]
        const to = points[pointIndex]
        if (!from || !to) continue
        const segmentPoints = splitSegmentAtPoints(from, to, net.points)
        for (
          let segmentPointIndex = 1;
          segmentPointIndex < segmentPoints.length;
          segmentPointIndex++
        ) {
          const segmentFrom = segmentPoints[segmentPointIndex - 1]
          const segmentTo = segmentPoints[segmentPointIndex]
          if (!segmentFrom || !segmentTo) continue
          if (prunedSegmentKeys.has(segmentKey(segmentFrom, segmentTo))) {
            continue
          }
          const fromPort = portsByPoint
            .get(pointKey(segmentFrom))
            ?.find((port) => port.isSchematicVisible)
          const toPort = portsByPoint
            .get(pointKey(segmentTo))
            ?.find((port) => port.isSchematicVisible)
          const fromPortId = getPortIdAtElectricalPoint(
            fromPort,
            segmentFrom,
            options.scale,
          )
          const toPortId = getPortIdAtElectricalPoint(
            toPort,
            segmentTo,
            options.scale,
          )
          edges.push({
            from: scalePoint(segmentFrom, options.scale),
            to: scalePoint(segmentTo, options.scale),
            ...(fromPortId ? { from_schematic_port_id: fromPortId } : {}),
            ...(toPortId ? { to_schematic_port_id: toPortId } : {}),
          })
        }
      }
      if (edges.length === 0) continue
      schematicTraceIdByRecord.set(wire, schematicTraceId)
      elements.push({
        type: "schematic_trace",
        edges,
        junctions: renderedWireIndex === 0 ? netJunctions : [],
        schematic_sheet_id: options.schematicSheetId,
        schematic_trace_id: schematicTraceId,
        source_trace_id: sourceTraceId,
      } satisfies SchematicTrace)
      renderedWireIndex++
    }

    for (const convertedPort of connectedConvertedPorts) {
      if (!convertedPort.isSchematicVisible) continue
      const electricalTerminal = scalePoint(convertedPort.point, options.scale)
      if (pointsEqual(convertedPort.schematicPort.center, electricalTerminal)) {
        continue
      }
      const portRecordIndex = document.records.indexOf(convertedPort.record)
      elements.push({
        type: "schematic_trace",
        edges: createPortLeadEdges(convertedPort, electricalTerminal),
        junctions: [],
        schematic_sheet_id: options.schematicSheetId,
        schematic_trace_id: `schematic_trace_altium_port_lead_${portRecordIndex}`,
        source_trace_id: sourceTraceId,
      } satisfies SchematicTrace)
    }

    const connectedPortIds = new Set(connectedPorts)
    for (const convertedPort of convertedPorts) {
      if (
        convertedPort.isSchematicVisible &&
        connectedPortIds.has(convertedPort.sourcePort.source_port_id)
      ) {
        convertedPort.schematicPort.is_connected = true
      }
    }
  }

  return {
    schematicTraceIdByRecord,
    sourceNetIdByName,
    sourceNetIdByRecord,
    sourcePortCountByRecord,
    sourceTraceIdByRecord,
  }
}

function getEquivalentPortPrunedSegmentKeys(params: {
  convertedPorts: ConvertedPort[]
  net: SemanticNet
  wires: AltiumRecord[]
}): Set<string> {
  const { convertedPorts, net, wires } = params
  const hiddenPortPoints = convertedPorts
    .filter((port) => !port.isSchematicVisible)
    .map((port) => port.point)
  if (hiddenPortPoints.length === 0) return new Set()

  const wireSegments = getWireSegments(wires)
  const protectedPointKeys = new Set(
    convertedPorts
      .filter((port) => port.isSchematicVisible)
      .map((port) => pointKey(port.point)),
  )
  for (const record of net.records) {
    if (!["4", "17", "18", "25"].includes(record.recordKind ?? "")) continue
    const location =
      record.recordKind === "18"
        ? getPortConnectionGeometry(record, wireSegments)?.anchor
        : getLocation(record)
    if (location) protectedPointKeys.add(pointKey(location))
  }

  interface PrunableSegment {
    endKey: string
    key: string
    startKey: string
  }
  const segments = new Map<string, PrunableSegment>()
  const segmentKeysByPoint = new Map<string, Set<string>>()
  const addIncidentSegment = (point: AltiumPoint, key: string): void => {
    const pointSegments = segmentKeysByPoint.get(pointKey(point))
    if (pointSegments) pointSegments.add(key)
    else segmentKeysByPoint.set(pointKey(point), new Set([key]))
  }

  for (const wire of wires) {
    const wirePoints = getSchematicRecordPoints(wire)
    for (let pointIndex = 1; pointIndex < wirePoints.length; pointIndex++) {
      const from = wirePoints[pointIndex - 1]
      const to = wirePoints[pointIndex]
      if (!from || !to) continue
      const segmentPoints = splitSegmentAtPoints(from, to, net.points)
      for (
        let splitIndex = 1;
        splitIndex < segmentPoints.length;
        splitIndex++
      ) {
        const segmentFrom = segmentPoints[splitIndex - 1]
        const segmentTo = segmentPoints[splitIndex]
        if (!segmentFrom || !segmentTo) continue
        const key = segmentKey(segmentFrom, segmentTo)
        segments.set(key, {
          endKey: pointKey(segmentTo),
          key,
          startKey: pointKey(segmentFrom),
        })
        addIncidentSegment(segmentFrom, key)
        addIncidentSegment(segmentTo, key)
      }
    }
  }

  const removedSegmentKeys = new Set<string>()
  const pendingPointKeys = hiddenPortPoints.map((point) => pointKey(point))
  while (pendingPointKeys.length > 0) {
    const currentPointKey = pendingPointKeys.shift()
    if (!currentPointKey || protectedPointKeys.has(currentPointKey)) continue
    const activeSegmentKeys = [
      ...(segmentKeysByPoint.get(currentPointKey) ?? []),
    ].filter((key) => !removedSegmentKeys.has(key))
    if (activeSegmentKeys.length !== 1) continue
    const segment = segments.get(activeSegmentKeys[0] ?? "")
    if (!segment) continue
    removedSegmentKeys.add(segment.key)
    pendingPointKeys.push(
      segment.startKey === currentPointKey ? segment.endKey : segment.startKey,
    )
  }
  return removedSegmentKeys
}

function segmentKey(start: AltiumPoint, end: AltiumPoint): string {
  const startKey = pointKey(start)
  const endKey = pointKey(end)
  return startKey < endKey ? `${startKey}|${endKey}` : `${endKey}|${startKey}`
}

function createPortLeadEdges(
  convertedPort: ConvertedPort,
  electricalTerminal: AltiumPoint,
): SchematicTrace["edges"] {
  const portCenter = convertedPort.schematicPort.center
  const facingDirection =
    convertedPort.schematicPort.facing_direction ?? "right"
  const elbow =
    facingDirection === "left" || facingDirection === "right"
      ? { x: electricalTerminal.x, y: portCenter.y }
      : { x: portCenter.x, y: electricalTerminal.y }
  const points = [portCenter, elbow, electricalTerminal].filter(
    (point, index, allPoints) =>
      index === 0 || !pointsEqual(point, allPoints[index - 1]),
  )

  return points.slice(1).flatMap((to, index) => {
    const from = points[index]
    if (!from) return []
    return [
      {
        from,
        ...(index === 0
          ? {
              from_schematic_port_id:
                convertedPort.schematicPort.schematic_port_id,
            }
          : {}),
        to,
      },
    ]
  })
}

function convertNetLabels(params: {
  connectivity: ConnectivityConversion
  document: AltiumSchDoc
  elements: AnyCircuitElement[]
  handledRecords: Set<AltiumRecord>
  options: SemanticSchematicOptions
  semanticNetGraph: SemanticNetGraph
}): void {
  const {
    connectivity,
    document,
    elements,
    handledRecords,
    options,
    semanticNetGraph: graph,
  } = params
  const allWireSegments = getWireSegments(
    document.records.filter((record) => record.recordKind === "27"),
  )

  for (const [recordIndex, record] of document.records.entries()) {
    const recordKind = record.recordKind
    if (!recordKind || !["4", "17", "18", "25"].includes(recordKind)) {
      continue
    }
    if (record.getBoolean("ISHIDDEN") && options.includeHidden !== true) {
      handledRecords.add(record)
      continue
    }
    const name =
      record.recordKind === "18"
        ? record.getDecoded("NAME")
        : record.getDecoded("TEXT")
    const portConnection =
      recordKind === "18"
        ? getPortConnectionGeometry(record, allWireSegments)
        : undefined
    const location = portConnection?.anchor ?? getLocation(record)
    if (!name || !location) continue
    const connectedWires = graph.getConnectedWiresForRecord(record)
    const wire = connectedWires[0]
    // Altium's generic label record is also used for page titles and notes.
    // It is only an electrical net label when it touches a wire.
    if (recordKind === "4" && !wire) continue
    const sourceTraceId = connectivity.sourceTraceIdByRecord.get(record)
    const shouldRenderInline =
      Boolean(sourceTraceId) &&
      (recordKind === "25" ||
        (recordKind === "18" &&
          (record.getNumber("IOTYPE") ?? 0) === 0 &&
          connectivity.sourcePortCountByRecord.get(record) === 2 &&
          !isPowerNet(name)))
    if (shouldRenderInline && sourceTraceId) {
      handledRecords.add(record)
      elements.push(
        createInlineNetLabelText({
          connectedWires,
          document,
          location,
          name,
          options,
          record,
          recordIndex,
          sourceTraceId,
        }),
      )
      continue
    }
    handledRecords.add(record)

    const sourceNetId =
      connectivity.sourceNetIdByRecord.get(record) ??
      getOrCreateSourceNet({
        elements,
        name,
        sourceNetIdByName: connectivity.sourceNetIdByName,
      })
    const schematicTraceId = wire
      ? connectivity.schematicTraceIdByRecord.get(wire)
      : undefined
    const direction = getRecordDirection(record)
    const symbolName =
      record.recordKind === "17"
        ? getPowerPortSymbolName(record, direction)
        : undefined
    const schematicNetLabel: SchematicNetLabel = {
      type: "schematic_net_label",
      anchor_position: scalePoint(location, options.scale),
      anchor_side: directionToOppositeSide(
        portConnection?.bodyDirection ?? direction,
      ),
      center: scalePoint(location, options.scale),
      schematic_net_label_id: `schematic_net_label_altium_${recordIndex}`,
      schematic_sheet_id: options.schematicSheetId,
      source_net_id: sourceNetId,
      text: name,
      ...(schematicTraceId ? { schematic_trace_id: schematicTraceId } : {}),
      ...(symbolName ? { symbol_name: symbolName } : {}),
    }
    elements.push(schematicNetLabel)
  }
}

function createInlineNetLabelText(params: {
  connectedWires: AltiumRecord[]
  document: AltiumSchDoc
  location: AltiumPoint
  name: string
  options: SemanticSchematicOptions
  record: AltiumRecord
  recordIndex: number
  sourceTraceId: string
}): SchematicText {
  const {
    connectedWires,
    document,
    location,
    name,
    options,
    record,
    recordIndex,
    sourceTraceId,
  } = params
  const direction = getInlineNetLabelDirection(record, location, connectedWires)
  const scaledLocation = scalePoint(location, options.scale)
  const fontSize = getInlineNetLabelFontSize(record, document, options.scale)
  const fontScale = fontSize / DEFAULT_INLINE_NET_LABEL_FONT_SIZE
  const textWidth =
    (name.length * INLINE_NET_LABEL_CHARACTER_WIDTH +
      INLINE_NET_LABEL_HORIZONTAL_PADDING) *
    fontScale
  const isVertical = direction === "up" || direction === "down"
  const directionSign = direction === "left" || direction === "down" ? -1 : 1
  const isTerminalPort = record.recordKind === "18"
  const anchor: SchematicText["anchor"] = isTerminalPort
    ? directionSign > 0
      ? "left"
      : "right"
    : "center"
  const position = isTerminalPort
    ? isVertical
      ? {
          x: scaledLocation.x - fontSize / 2,
          y: scaledLocation.y,
        }
      : {
          x: scaledLocation.x,
          y: scaledLocation.y + fontSize / 2,
        }
    : isVertical
      ? {
          x: scaledLocation.x - fontSize / 2,
          y: scaledLocation.y + (directionSign * textWidth) / 2,
        }
      : {
          x: scaledLocation.x + (directionSign * textWidth) / 2,
          y: scaledLocation.y + fontSize / 2,
        }

  return {
    type: "schematic_text",
    anchor,
    color: INLINE_NET_LABEL_COLOR,
    font_size: fontSize,
    position,
    rotation: isVertical ? -90 : 0,
    schematic_sheet_id: options.schematicSheetId,
    schematic_text_id: `schematic_inline_net_label_altium_${recordIndex}`,
    source_trace_id: sourceTraceId,
    text: name,
  }
}

function getInlineNetLabelFontSize(
  record: AltiumRecord,
  document: AltiumSchDoc,
  scale: number,
): number {
  const fontId = Math.max(
    Math.round(Number(record.getCaseInsensitive("FONTID") ?? 1)),
    1,
  )
  const sheetRecord = document.records.find(
    (candidate) => candidate.recordKind === "31",
  )
  const sourceFontSize = Number(
    sheetRecord?.getCaseInsensitive(`SIZE${fontId}`) ??
      DEFAULT_INLINE_NET_LABEL_FONT_SIZE / scale,
  )
  return Math.min(
    DEFAULT_INLINE_NET_LABEL_FONT_SIZE,
    Math.max(MIN_INLINE_NET_LABEL_FONT_SIZE, sourceFontSize * scale),
  )
}

function getInlineNetLabelDirection(
  record: AltiumRecord,
  location: AltiumPoint,
  connectedWires: AltiumRecord[],
): CardinalDirection {
  if (record.recordKind !== "18") return getRecordDirection(record)

  for (const wire of connectedWires) {
    const points = getSchematicRecordPoints(wire)
    for (let pointIndex = 1; pointIndex < points.length; pointIndex++) {
      const start = points[pointIndex - 1]
      const end = points[pointIndex]
      if (!start || !end || !isPointOnSegment(location, start, end)) continue
      const other = pointsEqual(location, start)
        ? end
        : pointsEqual(location, end)
          ? start
          : undefined
      if (!other) continue
      // Place the inline text away from the wire interior, matching the side
      // on which Altium drew the port body instead of covering the circuit.
      const dx = location.x - other.x
      const dy = location.y - other.y
      if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? "left" : "right"
      return dy < 0 ? "down" : "up"
    }
  }

  return getRecordDirection(record)
}

function getWireSegments(wires: AltiumRecord[]): SchematicSegment[] {
  return wires.flatMap((wire) => {
    const points = getSchematicRecordPoints(wire)
    const segments: SchematicSegment[] = []
    for (let pointIndex = 1; pointIndex < points.length; pointIndex++) {
      const start = points[pointIndex - 1]
      const end = points[pointIndex]
      if (start && end) segments.push({ end, start })
    }
    return segments
  })
}

function getPortConnectionGeometry(
  record: AltiumRecord,
  wireSegments: SchematicSegment[],
): { anchor: AltiumPoint; bodyDirection: CardinalDirection } | undefined {
  const origin = getLocation(record)
  if (!origin) return undefined

  const originToExtremity = getRecordDirection(record)
  const directionVector = VECTOR_BY_DIRECTION[originToExtremity]
  const width = Math.max(record.getNumber("WIDTH") ?? 16, 0)
  const extremity = {
    x: origin.x + directionVector.x * width,
    y: origin.y + directionVector.y * width,
  }
  const touchesWireEndpoint = (point: AltiumPoint): boolean =>
    wireSegments.some((segment) =>
      isPointNearSegmentEndpoint(point, segment.start, segment.end),
    )
  const originConnected = touchesWireEndpoint(origin)
  const extremityConnected = touchesWireEndpoint(extremity)
  const connectedEnd = record.getNumber("CONNECTEDEND")
  const connectsAtExtremity =
    connectedEnd === 2 ||
    (connectedEnd !== 1 &&
      connectedEnd !== 3 &&
      !originConnected &&
      extremityConnected)

  return connectsAtExtremity
    ? {
        anchor: extremity,
        bodyDirection: getOppositeDirection(originToExtremity),
      }
    : { anchor: origin, bodyDirection: originToExtremity }
}

function isPointNearSegmentEndpoint(
  point: AltiumPoint,
  start: AltiumPoint,
  end: AltiumPoint,
): boolean {
  return isPointNear(point, start) || isPointNear(point, end)
}

function isPointNear(point: AltiumPoint, other: AltiumPoint): boolean {
  const tolerance = 1.1
  return (point.x - other.x) ** 2 + (point.y - other.y) ** 2 <= tolerance ** 2
}

function getOppositeDirection(direction: CardinalDirection): CardinalDirection {
  if (direction === "up") return "down"
  if (direction === "down") return "up"
  return direction === "left" ? "right" : "left"
}

function getOrCreateSourceNet(params: {
  elements: AnyCircuitElement[]
  name: string
  sourceNetIdByName: Map<string, string>
}): string {
  const { elements, name, sourceNetIdByName } = params
  const normalizedName = name.trim().toUpperCase()
  const existing = sourceNetIdByName.get(normalizedName)
  if (existing) return existing

  const sourceNetIdBase = `source_net_altium_${sanitizeId(name)}`
  const existingIds = new Set(
    elements.flatMap((element) =>
      element.type === "source_net" ? [element.source_net_id] : [],
    ),
  )
  let sourceNetId = sourceNetIdBase
  let suffix = 2
  while (existingIds.has(sourceNetId)) {
    sourceNetId = `${sourceNetIdBase}_${suffix}`
    suffix++
  }
  const sourceNet: SourceNet = {
    type: "source_net",
    is_ground: isGroundNet(name),
    is_power: isPowerNet(name),
    member_source_group_ids: [],
    name,
    source_net_id: sourceNetId,
  }
  elements.push(sourceNet)
  sourceNetIdByName.set(normalizedName, sourceNetId)
  return sourceNetId
}

function selectCircuitJsonSymbol(params: {
  designator: string
  libraryReference: string
  ports: ConvertedPort[]
}): SymbolSelection | undefined {
  const { designator, libraryReference, ports } = params
  const classification = classifyComponent({ designator, libraryReference })
  let baseName: string | undefined
  let candidateNames: string[] = []
  if (classification === "testpoint" && ports.length === 1) {
    baseName = "testpoint"
  } else if (classification === "crystal" && ports.length === 2) {
    baseName = "crystal"
  } else if (classification === "crystal" && ports.length === 4) {
    baseName = "crystal_4pin"
  } else if (
    classification === "mosfet" &&
    ports.length >= 3 &&
    hasCompleteMosfetFunctionalGroups(ports)
  ) {
    const { channel_type, mosfet_mode } = getMosfetVariant(libraryReference)
    const channel = channel_type === "p" ? "p" : "n"
    const mode = mosfet_mode === "depletion" ? "d" : "e"
    const prefix = `${channel}_channel_${mode}_mosfet_transistor_gate_`
    candidateNames = SYMBOL_NAMES.filter((name) => name.startsWith(prefix))
  } else if (ports.length !== 2) {
    return undefined
  } else if (classification === "resistor") {
    baseName = "boxresistor"
  } else if (classification === "capacitor") {
    baseName = isPolarizedCapacitor(libraryReference)
      ? "capacitor_polarized"
      : "capacitor"
  } else if (classification === "ferrite_bead") {
    baseName = "ferrite_bead"
  } else if (classification === "inductor") {
    baseName = "inductor"
  } else if (classification === "led") {
    baseName = "led"
  }
  if (classification === "diode") {
    const lower = libraryReference.toLowerCase()
    baseName = lower.includes("schottky") ? "schottky_diode" : "diode"
  }
  if (baseName) {
    candidateNames = CARDINAL_DIRECTIONS.map(
      (direction) => `${baseName}_${direction}`,
    )
  }
  if (candidateNames.length === 0) return undefined

  const selections = candidateNames.flatMap((name) => {
    const symbol = SYMBOL_CATALOG[name]
    const supportsEquivalentMosfetPads =
      classification === "mosfet" && symbol?.ports.length === 3
    if (
      !symbol ||
      (!supportsEquivalentMosfetPads && symbol.ports.length !== ports.length)
    ) {
      return []
    }
    const assignments = assignConvertedPortsToSymbolPorts(ports, symbol, {
      allowFunctionalPortReuse: classification === "mosfet",
      geometryInterchangeableLabels:
        classification === "crystal" && ports.length === 4
          ? new Set(["2", "4"])
          : undefined,
    })
    return assignments.length === ports.length
      ? [{ assignments, name, symbol } satisfies SymbolSelection]
      : []
  })
  return selections.sort(
    (left, right) =>
      getSymbolDirectionScore(left) - getSymbolDirectionScore(right),
  )[0]
}

function hasCompleteMosfetFunctionalGroups(ports: ConvertedPort[]): boolean {
  const groups = ports.map((port) =>
    normalizeFunctionalPortLabel(port.sourcePort.name),
  )
  return (
    groups.every((group) => group !== undefined) && new Set(groups).size === 3
  )
}

function assignConvertedPortsToSymbolPorts(
  ports: ConvertedPort[],
  symbol: SchSymbol,
  options: {
    allowFunctionalPortReuse?: boolean
    geometryInterchangeableLabels?: Set<string>
  } = {},
): SymbolPortAssignment[] {
  const unusedSymbolPorts = new Set(symbol.ports)
  const orderedPorts = [...ports].sort(compareConvertedPorts)
  const assignments: SymbolPortAssignment[] = []
  const convertedCenter = getAveragePoint(ports.map(({ point }) => point))

  for (const [portIndex, convertedPort] of orderedPorts.entries()) {
    const rawHints = [
      convertedPort.schematicPort.pin_number?.toString(),
      convertedPort.sourcePort.name,
      ...(convertedPort.sourcePort.port_hints ?? []),
    ].filter((hint): hint is string => Boolean(hint))
    const functionalHints = new Set(
      rawHints.flatMap((hint) => {
        const normalized = normalizeFunctionalPortLabel(hint)
        return normalized ? [normalized] : []
      }),
    )
    const functionalPortCandidates = options.allowFunctionalPortReuse
      ? symbol.ports
      : [...unusedSymbolPorts]
    const functionalSymbolPort = functionalPortCandidates.find((symbolPort) =>
      symbolPort.labels.some((label) => {
        const normalized = normalizeFunctionalPortLabel(label)
        return normalized ? functionalHints.has(normalized) : false
      }),
    )
    const exactHints = new Set(rawHints.map((hint) => hint.toLowerCase()))
    const exactSymbolPort = [...unusedSymbolPorts].find((symbolPort) =>
      symbolPort.labels.some((label) => exactHints.has(label.toLowerCase())),
    )
    const interchangeableLabels = options.geometryInterchangeableLabels
    const isGeometryInterchangeable = rawHints.some((hint) =>
      interchangeableLabels?.has(hint.toLowerCase()),
    )
    const geometrySymbolPort = isGeometryInterchangeable
      ? [...unusedSymbolPorts]
          .filter((symbolPort) =>
            symbolPort.labels.some((label) =>
              interchangeableLabels?.has(label.toLowerCase()),
            ),
          )
          .sort(
            (left, right) =>
              getVectorDifference(
                subtractPoints(convertedPort.point, convertedCenter),
                subtractPoints(left, symbol.center),
              ) -
              getVectorDifference(
                subtractPoints(convertedPort.point, convertedCenter),
                subtractPoints(right, symbol.center),
              ),
          )[0]
      : undefined
    const symbolPort =
      functionalSymbolPort ??
      geometrySymbolPort ??
      exactSymbolPort ??
      symbol.ports[portIndex] ??
      [...unusedSymbolPorts][0]
    if (!symbolPort) continue
    if (!functionalSymbolPort || !options.allowFunctionalPortReuse) {
      unusedSymbolPorts.delete(symbolPort)
    }
    assignments.push({ convertedPort, symbolPort })
  }
  return assignments
}

function getAveragePoint(points: AltiumPoint[]): AltiumPoint {
  if (points.length === 0) return { x: 0, y: 0 }
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  }
}

function compareConvertedPorts(
  left: ConvertedPort,
  right: ConvertedPort,
): number {
  const leftPinNumber = left.schematicPort.pin_number
  const rightPinNumber = right.schematicPort.pin_number
  if (leftPinNumber !== undefined && rightPinNumber !== undefined) {
    return leftPinNumber - rightPinNumber
  }
  return (
    (left.schematicPort.true_ccw_index ?? 0) -
    (right.schematicPort.true_ccw_index ?? 0)
  )
}

function getSymbolDirectionScore(selection: SymbolSelection): number {
  const [first, second] = selection.assignments
  if (!first) return Number.POSITIVE_INFINITY
  if (!second) {
    const expectedDirection =
      VECTOR_BY_DIRECTION[
        first.convertedPort.schematicPort.facing_direction ?? "right"
      ]
    return getVectorDifference(
      expectedDirection,
      subtractPoints(first.symbolPort, selection.symbol.center),
    )
  }
  let difference = 0
  let comparisonCount = 0
  for (
    let firstIndex = 0;
    firstIndex < selection.assignments.length;
    firstIndex++
  ) {
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < selection.assignments.length;
      secondIndex++
    ) {
      const firstAssignment = selection.assignments[firstIndex]
      const secondAssignment = selection.assignments[secondIndex]
      if (!firstAssignment || !secondAssignment) continue
      const pairDifference = getVectorDifference(
        subtractPoints(
          secondAssignment.convertedPort.point,
          firstAssignment.convertedPort.point,
        ),
        subtractPoints(secondAssignment.symbolPort, firstAssignment.symbolPort),
      )
      if (!Number.isFinite(pairDifference)) continue
      difference += pairDifference
      comparisonCount++
    }
  }
  return comparisonCount > 0
    ? difference / comparisonCount
    : Number.POSITIVE_INFINITY
}

function normalizeFunctionalPortLabel(value: string): string | undefined {
  const normalized = value.toLowerCase().replace(/[^a-z]/gu, "")
  if (normalized === "g" || normalized === "gate") return "gate"
  if (normalized === "d" || normalized === "drain") return "drain"
  if (normalized === "s" || normalized === "source") return "source"
  return undefined
}

function getVectorDifference(left: AltiumPoint, right: AltiumPoint): number {
  const leftLength = Math.hypot(left.x, left.y)
  const rightLength = Math.hypot(right.x, right.y)
  if (leftLength === 0 || rightLength === 0) {
    return Number.POSITIVE_INFINITY
  }
  const cosine =
    (left.x * right.x + left.y * right.y) / (leftLength * rightLength)
  return 1 - Math.max(-1, Math.min(1, cosine))
}

function applyNativeSymbolPortGeometry(params: {
  center: AltiumPoint
  selection: SymbolSelection
}): void {
  const { center, selection } = params
  const assignmentsBySymbolPort = new Map<
    SchSymbol["ports"][number],
    SymbolPortAssignment[]
  >()
  for (const assignment of selection.assignments) {
    const assignments = assignmentsBySymbolPort.get(assignment.symbolPort)
    if (assignments) assignments.push(assignment)
    else assignmentsBySymbolPort.set(assignment.symbolPort, [assignment])
  }

  for (const [symbolPort, assignments] of assignmentsBySymbolPort) {
    const offset = subtractPoints(symbolPort, selection.symbol.center)
    const direction = getDirectionForVector(offset)
    const symbolPortCenter = {
      x: center.x + offset.x,
      y: center.y + offset.y,
    }
    const representative = assignments.sort(
      (left, right) =>
        getPointDistance(
          left.convertedPort.schematicPort.center,
          symbolPortCenter,
        ) -
        getPointDistance(
          right.convertedPort.schematicPort.center,
          symbolPortCenter,
        ),
    )[0]
    for (const { convertedPort } of assignments) {
      convertedPort.isSchematicVisible =
        convertedPort === representative?.convertedPort
      convertedPort.schematicPort.center = symbolPortCenter
      convertedPort.schematicPort.distance_from_component_edge = Math.hypot(
        offset.x,
        offset.y,
      )
      convertedPort.schematicPort.facing_direction = direction
      convertedPort.schematicPort.side_of_component = directionToSide(direction)
    }
  }
}

function getPointDistance(left: AltiumPoint, right: AltiumPoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y)
}

function getDirectionForVector(vector: AltiumPoint): CardinalDirection {
  if (Math.abs(vector.x) >= Math.abs(vector.y)) {
    return vector.x >= 0 ? "right" : "left"
  }
  return vector.y >= 0 ? "up" : "down"
}

function subtractPoints(
  left: { x: number; y: number },
  right: { x: number; y: number },
): AltiumPoint {
  return { x: left.x - right.x, y: left.y - right.y }
}

function classifyComponent(params: {
  designator: string
  libraryReference: string
}):
  | "capacitor"
  | "crystal"
  | "diode"
  | "ferrite_bead"
  | "inductor"
  | "led"
  | "mosfet"
  | "resistor"
  | "testpoint"
  | "unknown" {
  const { designator, libraryReference } = params
  const prefix = designator.match(/^[A-Z]+/iu)?.[0]?.toUpperCase() ?? ""
  const lowerReference = libraryReference.toLowerCase()
  if (prefix === "TP" || lowerReference.includes("testpoint")) {
    return "testpoint"
  }
  if (
    prefix === "Y" ||
    lowerReference.includes("crystal") ||
    /(?:^|[_-])cry(?:\d|[_-]|$)/iu.test(libraryReference)
  ) {
    return "crystal"
  }
  if (lowerReference.includes("mosfet")) return "mosfet"
  if (
    prefix === "FB" ||
    prefix === "FL" ||
    lowerReference.includes("ferrite") ||
    lowerReference.includes("emifilter_ind")
  ) {
    return "ferrite_bead"
  }
  if (prefix === "LED" || lowerReference.includes("led")) return "led"
  if (prefix === "R" || lowerReference.includes("resistor")) return "resistor"
  if (prefix === "C" || /(?:^|[_-])cap(?:[_-]|$)/iu.test(libraryReference)) {
    return "capacitor"
  }
  if (prefix === "L" || lowerReference.includes("inductor")) return "inductor"
  if (prefix === "D" || lowerReference.includes("diode")) return "diode"
  return "unknown"
}

function getMosfetVariant(libraryReference: string): {
  channel_type: "n" | "p"
  mosfet_mode: "depletion" | "enhancement"
} {
  const lowerReference = libraryReference.toLowerCase()
  const isPChannel =
    /(?:^|[_-])p(?:channel)?(?:[_-]|$)/iu.test(libraryReference) ||
    lowerReference.includes("pmos") ||
    lowerReference.includes("csd25")
  return {
    channel_type: isPChannel ? "p" : "n",
    mosfet_mode: lowerReference.includes("depletion")
      ? "depletion"
      : "enhancement",
  }
}

function isPolarizedCapacitor(libraryReference: string): boolean {
  return /(?:^|[_-])cap(?:acitor)?[_-]?pol(?:arized)?(?:[_-]|$)/iu.test(
    libraryReference,
  )
}

function getPrimaryComponentValue(value: string): string {
  return value.split(/[_/\s]+/u).find(Boolean) ?? value
}

function getPowerPortSymbolName(
  record: AltiumRecord,
  direction: CardinalDirection,
): string {
  const style = Math.round(record.getNumber("STYLE") ?? 2)
  if (style === 4) return `ground_${direction}`
  if (style === 5) return `ground_${direction}`
  if (style === 6) return `tilted_ground_${direction}`
  return `vcc_${direction}`
}

function getComponentBodyBounds(
  records: AltiumRecord[],
  portPoints: AltiumPoint[],
): Bounds {
  const rectangles = records
    .filter((record) => record.recordKind === "14")
    .flatMap((record) => {
      const rectangle = getRectangle(record)
      return rectangle ? [rectangle] : []
    })
  if (rectangles.length > 0) return mergeBounds(rectangles)

  const points: AltiumPoint[] = []
  for (const record of records) {
    if (record.recordKind === "2") continue
    const location = getLocation(record)
    const corner = getCorner(record)
    if (location && corner) points.push(location, corner)
    points.push(...getSchematicRecordPoints(record))
    if (record.recordKind === "8" && location) {
      const radiusX = Math.abs(record.getNumber("RADIUS") ?? 0)
      const radiusY = Math.abs(record.getNumber("SECONDARYRADIUS") ?? radiusX)
      points.push(
        { x: location.x - radiusX, y: location.y - radiusY },
        { x: location.x + radiusX, y: location.y + radiusY },
      )
    }
  }
  if (points.length > 0) return getBoundsForPoints(points)
  const bounds = getBoundsForPoints(portPoints)
  if (bounds.minX === bounds.maxX) {
    bounds.minX -= 2
    bounds.maxX += 2
  }
  if (bounds.minY === bounds.maxY) {
    bounds.minY -= 2
    bounds.maxY += 2
  }
  return bounds
}

function findOwnedText(
  records: AltiumRecord[],
  recordKind: string,
  name: string,
): string | undefined {
  return records
    .find(
      (record) =>
        record.recordKind === recordKind &&
        record.getDecoded("NAME")?.toLowerCase() === name.toLowerCase(),
    )
    ?.getDecoded("TEXT")
}

function isOwnedRecordVisible(
  record: AltiumRecord,
  currentPartId: number,
): boolean {
  const ownerPartId = record.getNumber("OWNERPARTID")
  const ownerPartDisplayMode = record.getNumber("OWNERPARTDISPLAYMODE")
  return (
    (ownerPartId === undefined ||
      ownerPartId <= 0 ||
      ownerPartId === currentPartId) &&
    (ownerPartDisplayMode === undefined || ownerPartDisplayMode === 0)
  )
}

function isPinHidden(pin: AltiumRecord): boolean {
  const pinConglomerate = pin.getNumber("PINCONGLOMERATE")
  return (
    pin.getBoolean("ISHIDDEN") === true ||
    (pinConglomerate !== undefined && (pinConglomerate & 0x04) !== 0)
  )
}

function getRecordDirection(record: AltiumRecord): CardinalDirection {
  const orientation =
    ((Math.round(record.getNumber("ORIENTATION") ?? 0) % 4) + 4) % 4
  return DIRECTION_BY_ORIENTATION[orientation] ?? "right"
}

function directionToSide(
  direction: CardinalDirection,
): NonNullable<SchematicPort["side_of_component"]> {
  if (direction === "up") return "top"
  if (direction === "down") return "bottom"
  return direction
}

function directionToOppositeSide(
  direction: CardinalDirection,
): SchematicNetLabel["anchor_side"] {
  if (direction === "up") return "bottom"
  if (direction === "down") return "top"
  return direction === "left" ? "right" : "left"
}

function groupByPoint(ports: ConvertedPort[]): Map<string, ConvertedPort[]> {
  const grouped = new Map<string, ConvertedPort[]>()
  for (const port of ports) {
    const key = pointKey(port.point)
    const existing = grouped.get(key)
    if (existing) existing.push(port)
    else grouped.set(key, [port])
  }
  return grouped
}

function uniqueConvertedPorts(ports: ConvertedPort[]): ConvertedPort[] {
  const seenSourcePortIds = new Set<string>()
  return ports.filter((port) => {
    const sourcePortId = port.sourcePort.source_port_id
    if (seenSourcePortIds.has(sourcePortId)) return false
    seenSourcePortIds.add(sourcePortId)
    return true
  })
}

function getPortIdAtElectricalPoint(
  port: ConvertedPort | undefined,
  electricalPoint: AltiumPoint,
  scale: number,
): string | undefined {
  if (!port?.isSchematicVisible) return undefined
  return pointsEqual(
    port.schematicPort.center,
    scalePoint(electricalPoint, scale),
  )
    ? port.schematicPort.schematic_port_id
    : undefined
}

function getBoundsForPoints(points: AltiumPoint[]): Bounds {
  if (points.length === 0) return { maxX: 1, maxY: 1, minX: -1, minY: -1 }
  return {
    maxX: Math.max(...points.map((point) => point.x)),
    maxY: Math.max(...points.map((point) => point.y)),
    minX: Math.min(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
  }
}

function mergeBounds(bounds: Bounds[]): Bounds {
  return {
    maxX: Math.max(...bounds.map((bound) => bound.maxX)),
    maxY: Math.max(...bounds.map((bound) => bound.maxY)),
    minX: Math.min(...bounds.map((bound) => bound.minX)),
    minY: Math.min(...bounds.map((bound) => bound.minY)),
  }
}

function getBoundsCenter(bounds: Bounds): AltiumPoint {
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  }
}

function getRectangle(record: AltiumRecord): Bounds | undefined {
  const location = getLocation(record)
  const corner = getCorner(record)
  if (!location || !corner) return undefined
  return {
    maxX: Math.max(location.x, corner.x),
    maxY: Math.max(location.y, corner.y),
    minX: Math.min(location.x, corner.x),
    minY: Math.min(location.y, corner.y),
  }
}

function getLocation(record: AltiumRecord): AltiumPoint | undefined {
  const x = getCoordinate(record, "LOCATION.X")
  const y = getCoordinate(record, "LOCATION.Y")
  return x === undefined || y === undefined ? undefined : { x, y }
}

function getCorner(record: AltiumRecord): AltiumPoint | undefined {
  const x = getCoordinate(record, "CORNER.X")
  const y = getCoordinate(record, "CORNER.Y")
  return x === undefined || y === undefined ? undefined : { x, y }
}

function getCoordinate(record: AltiumRecord, key: string): number | undefined {
  const raw = record.getCaseInsensitive(key)
  if (raw === undefined) return undefined
  const integer = Number(raw)
  if (!Number.isFinite(integer)) return undefined
  const fractionRaw = record.getCaseInsensitive(`${key}_FRAC`)
  if (fractionRaw === undefined) return integer
  const fraction = Number(`0.${fractionRaw.replace(/^[+-]/u, "")}`)
  if (!Number.isFinite(fraction)) return integer
  return integer < 0 ? integer - fraction : integer + fraction
}

function parsePinNumber(value: string): number | undefined {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined
}

function scalePoint(point: AltiumPoint, scale: number): AltiumPoint {
  return { x: point.x * scale, y: point.y * scale }
}

function pointKey(point: AltiumPoint): string {
  return `${point.x.toFixed(6)},${point.y.toFixed(6)}`
}

function pointsEqual(
  left: AltiumPoint,
  right: AltiumPoint | undefined,
): boolean {
  return (
    right !== undefined &&
    Math.abs(left.x - right.x) < 0.000001 &&
    Math.abs(left.y - right.y) < 0.000001
  )
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
}

function sanitizeId(value: string): string {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "")
  return sanitized || "unnamed"
}

function isGroundNet(name: string): boolean {
  return /(?:^|[_+-])(?:[adp]?gnd|ground)(?:$|[_+\d-])/iu.test(name)
}

function isPowerNet(name: string): boolean {
  return (
    isGroundNet(name) ||
    /(?:^|[_+-])(?:vcc|vdd|vss)(?:$|[a-z0-9_+-])/iu.test(name) ||
    /(?:^|[_+-])(?:vin|vout|pwr|power)(?:$|[_+\d-])/iu.test(name)
  )
}
