import type { AltiumRecord } from "altiumts"
import { getElectricalLabelName } from "../netLabels/getElectricalLabelName"
import { isElectricalLabelRecord } from "../netLabels/isElectricalLabelRecord"

export function getElectricalRecordName(
  record: AltiumRecord,
): string | undefined {
  return isElectricalLabelRecord(record)
    ? getElectricalLabelName(record)
    : undefined
}
