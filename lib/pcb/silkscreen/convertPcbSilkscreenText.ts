import type { AltiumTextRecord } from "altiumts"
import type { PcbSilkscreenText } from "circuit-json"
import { milsToMillimeters, toMillimeterPoint } from "../geometry"
import { getPcbComponentIdForRecord } from "../identifiers"
import { mapOverlayLayer } from "../layers"
import { getPcbTextKnockout, mapTextAnchor } from "../text"

export function convertPcbSilkscreenText({
  record,
  recordIndex,
}: {
  record: AltiumTextRecord
  recordIndex: number
}): PcbSilkscreenText | undefined {
  if (!record.position || !record.text) return undefined
  return {
    type: "pcb_silkscreen_text",
    pcb_silkscreen_text_id: `pcb_silkscreen_text_altium_${recordIndex}`,
    pcb_component_id: getPcbComponentIdForRecord(record),
    text: record.text,
    font: "tscircuit2024",
    font_size: milsToMillimeters(record.heightMils ?? 30),
    anchor_position: toMillimeterPoint(record.position),
    anchor_alignment: mapTextAnchor(record.justification),
    ccw_rotation: record.rotation,
    layer: mapOverlayLayer(record.layer),
    is_mirrored: record.mirrored,
    ...getPcbTextKnockout(record),
  }
}
