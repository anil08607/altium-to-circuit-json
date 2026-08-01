import type { AnyCircuitElement } from "circuit-json"
import { convertCircuitJsonToSchematicSvg } from "circuit-to-svg"

type SchematicSvgOptions = NonNullable<
  Parameters<typeof convertCircuitJsonToSchematicSvg>[1]
>

export function renderImportedSchematicToSvg(
  circuitJson: AnyCircuitElement[],
  options: SchematicSvgOptions = {},
): string {
  // circuit-to-svg currently gives every schematic_sheet a fixed, centered A4
  // decoration. Imported Altium sheets already contain their real page border,
  // so including both expands the viewport and draws a second title block.
  const importedPageElements = circuitJson.filter(
    (element) => element.type !== "schematic_sheet",
  )
  return convertCircuitJsonToSchematicSvg(importedPageElements, {
    height: 600,
    width: 800,
    ...options,
  }).replace(/[ \t]+$/gmu, "")
}
