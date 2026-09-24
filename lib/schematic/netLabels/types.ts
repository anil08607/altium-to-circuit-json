import type {
  AltiumSchNetLabelRecord,
  AltiumSchPortRecord,
  AltiumSchPowerPortRecord,
} from "altiumts"

export type ElectricalLabelRecord =
  | AltiumSchNetLabelRecord
  | AltiumSchPortRecord
  | AltiumSchPowerPortRecord
