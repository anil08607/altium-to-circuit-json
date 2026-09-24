import {
  type AltiumRecord,
  AltiumSchNetLabelRecord,
  AltiumSchPortRecord,
  AltiumSchPowerPortRecord,
} from "altiumts"
import type { ElectricalLabelRecord } from "./types"

export function isElectricalLabelRecord(
  record: AltiumRecord,
): record is ElectricalLabelRecord {
  return (
    record instanceof AltiumSchNetLabelRecord ||
    record instanceof AltiumSchPortRecord ||
    record instanceof AltiumSchPowerPortRecord
  )
}
