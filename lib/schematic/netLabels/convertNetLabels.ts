import {
  type AltiumRecord,
  type AltiumSchDoc,
  AltiumSchNetLabelRecord,
  AltiumSchPortRecord,
  AltiumSchPowerPortRecord,
} from "altiumts"
import type { AnyCircuitElement, SchematicNetLabel } from "circuit-json"
import {
  directionToOppositeSide,
  getOrCreateSourceNet,
  getPortConnectionGeometry,
  getRecordDirection,
  getWireSegments,
} from "../connectivity"
import { getLocation, scalePoint } from "../geometry"
import { isPowerNet } from "../identifiers"
import type {
  ConnectivityConversion,
  SemanticNetGraph,
  SemanticSchematicOptions,
} from "../model"
import { createInlineNetLabelText } from "./createInlineNetLabelText"
import { getElectricalLabelName } from "./getElectricalLabelName"
import { getPowerPortSymbolName } from "./getPowerPortSymbolName"
import { isElectricalLabelRecord } from "./isElectricalLabelRecord"

export function convertNetLabels({
  connectivity,
  document,
  elements,
  handledRecords,
  options,
  semanticNetGraph: graph,
}: {
  connectivity: ConnectivityConversion
  document: AltiumSchDoc
  elements: AnyCircuitElement[]
  handledRecords: Set<AltiumRecord>
  options: SemanticSchematicOptions
  semanticNetGraph: SemanticNetGraph
}): void {
  const allWireSegments = getWireSegments(document.wires)

  for (const [recordIndex, record] of document.records.entries()) {
    if (!isElectricalLabelRecord(record)) continue
    if (record.getBoolean("ISHIDDEN") && options.includeHidden !== true) {
      handledRecords.add(record)
      continue
    }
    const name = getElectricalLabelName(record)
    const portConnection =
      record instanceof AltiumSchPortRecord
        ? getPortConnectionGeometry(record, allWireSegments)
        : undefined
    const location = portConnection?.anchor ?? getLocation(record)
    if (!name || !location) continue
    const connectedWires = graph.getConnectedWiresForRecord(record)
    const wire = connectedWires[0]
    const sourceTraceId = connectivity.sourceTraceIdByRecord.get(record)
    const shouldRenderInline =
      Boolean(sourceTraceId) &&
      (record instanceof AltiumSchNetLabelRecord ||
        (record instanceof AltiumSchPortRecord &&
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
      record instanceof AltiumSchPowerPortRecord
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
