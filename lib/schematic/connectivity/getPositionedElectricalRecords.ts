import {
  type AltiumSchDoc,
  AltiumSchJunctionRecord,
  AltiumSchPortRecord,
} from "altiumts"
import { getLocation } from "../geometry"
import type { SchematicSegment } from "../model"
import { isElectricalLabelRecord } from "../netLabels/isElectricalLabelRecord"
import { getPortConnectionGeometry } from "./getPortConnectionGeometry"
import type { PositionedElectricalRecord } from "./types"

export function getPositionedElectricalRecords(
  document: AltiumSchDoc,
  segments: SchematicSegment[],
): PositionedElectricalRecord[] {
  return document.records.flatMap((record) => {
    if (
      !isElectricalLabelRecord(record) &&
      !(record instanceof AltiumSchJunctionRecord)
    ) {
      return []
    }
    const point =
      record instanceof AltiumSchPortRecord
        ? getPortConnectionGeometry(record, segments)?.anchor
        : getLocation(record)
    return point ? [{ point, record }] : []
  })
}
