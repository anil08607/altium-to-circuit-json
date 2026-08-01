import type { AnyCircuitElement } from "circuit-json"
import { convertCircuitJsonToSchematicSvg } from "circuit-to-svg"

type SchematicSvgOptions = NonNullable<
  Parameters<typeof convertCircuitJsonToSchematicSvg>[1]
>

export function renderImportedSchematicToSvg(
  circuitJson: AnyCircuitElement[],
  options: SchematicSvgOptions = {},
): string {
  return convertCircuitJsonToSchematicSvg(circuitJson, {
    height: 600,
    width: 800,
    ...options,
  }).replace(/[ \t]+$/gmu, "")
}
