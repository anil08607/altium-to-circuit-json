import type { AltiumSchDoc } from "altiumts"
import type {
  AnyCircuitElement,
  SchematicGroup,
  SchematicSheet,
} from "circuit-json"
import { convertSemanticSchematic } from "./schematic/convert-semantic-schematic"
import { convertSchematicRecord as renderSchematicRecord } from "./schematic/render-record"
import {
  createSheetBorder,
  getAltiumSheetDimensions,
  getPageFitScale,
  SCHEMATIC_SHEET_ID,
  type SchematicContext,
  shouldRenderSchematicRecord,
  translateSchematicElement,
} from "./schematic/sheet-layout"
export interface ConvertAltiumSchDocOptions {
  centerOnSchematicSheet?: boolean
  includeHidden?: boolean
  includeSheetBorder?: boolean
  includeText?: boolean
  schematicUnitScale?: number
  sheetName?: string
}

export function convertAltiumSchDocToCircuitJson(
  document: AltiumSchDoc,
  options: ConvertAltiumSchDocOptions = {},
): AnyCircuitElement[] {
  const records = document.records
  const sheetRecord = records.find((record) => record.recordKind === "31")
  const sheetDimensions = getAltiumSheetDimensions(sheetRecord)
  const scale = options.schematicUnitScale ?? getPageFitScale(sheetDimensions)
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new RangeError("schematicUnitScale must be a positive finite number")
  }

  const context: SchematicContext = { document, records, scale, sheetRecord }
  const elements: AnyCircuitElement[] = [
    {
      type: "schematic_sheet",
      schematic_sheet_id: SCHEMATIC_SHEET_ID,
      name: options.sheetName ?? "Altium schematic",
      outline_color: "#334155",
      sheet_index: 0,
    } satisfies SchematicSheet,
  ]

  if (options.includeSheetBorder === true) {
    elements.push(createSheetBorder(sheetRecord, scale))
  }

  const semanticConversion = convertSemanticSchematic(document, {
    includeHidden: options.includeHidden,
    includeText: options.includeText,
    scale,
    schematicSheetId: SCHEMATIC_SHEET_ID,
  })
  elements.push(...semanticConversion.elements)

  for (const [index, record] of records.entries()) {
    if (semanticConversion.handledRecords.has(record)) continue
    if (!shouldRenderSchematicRecord(record, context)) continue
    const converted = renderSchematicRecord(record, index, context, options)
    elements.push(...converted)
  }

  const schematicComponentIds = elements
    .filter(
      (
        element,
      ): element is Extract<
        AnyCircuitElement,
        { type: "schematic_component" }
      > => element.type === "schematic_component",
    )
    .map((element) => element.schematic_component_id)
  if (schematicComponentIds.length > 0) {
    elements.push({
      type: "schematic_group",
      schematic_group_id: "schematic_group_altium",
      source_group_id: "source_group_altium",
      schematic_sheet_id: SCHEMATIC_SHEET_ID,
      center: {
        x: (sheetDimensions.width * scale) / 2,
        y: (sheetDimensions.height * scale) / 2,
      },
      width: sheetDimensions.width * scale,
      height: sheetDimensions.height * scale,
      schematic_component_ids: schematicComponentIds,
      name: options.sheetName ?? "Altium schematic",
    } satisfies SchematicGroup)
  }

  if (options.centerOnSchematicSheet === false) return elements

  const offset = {
    x: (-sheetDimensions.width * scale) / 2,
    y: (-sheetDimensions.height * scale) / 2,
  }
  return elements.map((element) => translateSchematicElement(element, offset))
}
