import type { AltiumTextRecord } from "altiumts"
import type { PcbCopperText } from "circuit-json"
import { milsToMillimeters, toMillimeterPoint } from "../geometry"
import { getPcbComponentIdForRecord } from "../identifiers"
import { mapAltiumCopperLayer } from "../layers"
import { getPcbTextKnockout } from "./getPcbTextKnockout"
import { mapTextAnchor } from "./mapTextAnchor"

export function convertPcbCopperText({
  record,
  recordIndex,
}: {
  record: AltiumTextRecord
  recordIndex: number
}): PcbCopperText | undefined {
  if (!record.position || !record.text) return undefined
  const layer = mapAltiumCopperLayer(record.layer)
  if (!layer) return undefined
  return {
    type: "pcb_copper_text",
    pcb_copper_text_id: `pcb_copper_text_altium_${recordIndex}`,
    pcb_component_id: getPcbComponentIdForRecord(record),
    text: record.text,
    font: "tscircuit2024",
    font_size: milsToMillimeters(record.heightMils ?? 30),
    anchor_position: toMillimeterPoint(record.position),
    anchor_alignment: mapTextAnchor(record.justification),
    ccw_rotation: record.rotation,
    layer,
    is_mirrored: record.mirrored,
    ...getPcbTextKnockout(record),
  }
}
