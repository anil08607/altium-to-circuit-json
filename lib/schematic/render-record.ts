import type { AltiumRecord } from "altiumts"
import type { AnyCircuitElement, SchematicCircle } from "circuit-json"
import type { ConvertAltiumSchDocOptions } from "../convert-altium-sch-doc-to-circuit-json"
import { getLocation, scalePoint } from "./coordinates"
import { renderPrimitiveRecord } from "./render-primitives"
import {
  renderHierarchicalPort,
  renderPin,
  renderPowerPort,
} from "./render-symbols"
import { altiumColorToCss, createLine, renderTextRecord } from "./render-text"
import { SCHEMATIC_SHEET_ID, type SchematicContext } from "./sheet-layout"
export function convertSchematicRecord(
  record: AltiumRecord,
  index: number,
  context: SchematicContext,
  options: ConvertAltiumSchDocOptions,
): AnyCircuitElement[] {
  const kind = record.recordKind
  const scale = context.scale
  const color = altiumColorToCss(record.getCaseInsensitive("COLOR"), "#1f2937")
  const strokeWidth = Math.max(
    Number(record.getCaseInsensitive("LINEWIDTH") ?? 1) * scale,
    0.05,
  )

  const primitive = renderPrimitiveRecord({
    record,
    index,
    context,
    color,
    strokeWidth,
  })
  if (primitive) return primitive

  if (kind === "2") {
    return renderPin({ record, index, context, options, color })
  }

  if (kind === "29") {
    const location = getLocation(record)
    if (!location) return []
    return [
      {
        type: "schematic_circle",
        schematic_circle_id: `schematic_junction_altium_${index}`,
        schematic_sheet_id: SCHEMATIC_SHEET_ID,
        center: scalePoint(location, scale),
        radius: Math.max(
          Number(record.getCaseInsensitive("SIZE") ?? 1) * 0.18,
          0.15,
        ),
        color,
        is_filled: true,
        fill_color: color,
        is_dashed: false,
      } satisfies SchematicCircle,
    ]
  }

  if (kind === "22") {
    const location = getLocation(record)
    if (!location) return []
    // altiumts renders the "Small Cross" no-ERC symbol with four Altium
    // coordinate units on either side of its anchor.
    const radius = 4
    const noErcStrokeWidth = Math.max(scale, 0.02)
    return [
      createLine({
        index,
        start: { x: location.x - radius, y: location.y - radius },
        end: { x: location.x + radius, y: location.y + radius },
        color,
        strokeWidth: noErcStrokeWidth,
        scale,
        suffix: "a",
      }),
      createLine({
        index,
        start: { x: location.x + radius, y: location.y - radius },
        end: { x: location.x - radius, y: location.y + radius },
        color,
        strokeWidth: noErcStrokeWidth,
        scale,
        suffix: "b",
      }),
    ]
  }

  if (kind === "17") {
    return renderPowerPort({ record, index, context, options, color })
  }

  if (kind === "18") {
    return renderHierarchicalPort({ record, index, context, options, color })
  }

  const textElement = renderTextRecord({
    record,
    index,
    context,
    options,
    color,
    strokeWidth,
  })
  if (textElement) return textElement

  return []
}
