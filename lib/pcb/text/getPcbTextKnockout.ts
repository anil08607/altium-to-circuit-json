import { type AltiumTextRecord, parseAltiumMeasurementToMils } from "altiumts"
import type { PcbCopperText, PcbSilkscreenText } from "circuit-json"
import { milsToMillimeters } from "../geometry"

export function getPcbTextKnockout(
  record: AltiumTextRecord,
): Pick<PcbCopperText | PcbSilkscreenText, "is_knockout" | "knockout_padding"> {
  if (record.inverted !== true) return {}

  const marginMils = parseAltiumMeasurementToMils(
    record.getCaseInsensitive("MARGINBORDERWIDTH"),
  )
  // Fixed-rectangle inversion uses TEXTBOXWIDTH/HEIGHT, not the saved margin.
  // Preserve its polarity without treating those dimensions as text padding.
  if (
    record.getBoolean("INVERTEDRECT") === true ||
    marginMils === undefined ||
    !Number.isFinite(marginMils) ||
    marginMils < 0
  ) {
    return { is_knockout: true }
  }

  const marginMm = milsToMillimeters(marginMils)
  return {
    is_knockout: true,
    knockout_padding: {
      left: marginMm,
      right: marginMm,
      top: marginMm,
      bottom: marginMm,
    },
  }
}
