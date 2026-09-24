import { expect, test } from "bun:test"
import { createOpenSourceSchematicComparison } from "../helpers/create-open-source-schematic-comparison"
import { expectValidImportedSchematic } from "../helpers/expect-valid-imported-schematic"

test(
  "NodeMCU ESP-12 schematic: altiumts SVG on the left, Circuit JSON SVG on the right",
  async () => {
    const { circuitJson, circuitJsonSvg, comparisonSvg } =
      await createOpenSourceSchematicComparison({
        filename: "nodemcu-esp12.SchDoc",
        schematicName: "NodeMCU ESP-12",
      })

    expectValidImportedSchematic({ circuitJson, circuitJsonSvg })
    expect(
      circuitJson.filter(
        (element) =>
          element.type === "schematic_text" && element.text === "RESV",
      ),
    ).toHaveLength(5)
    expect(
      circuitJson.filter(
        (element) => element.type === "source_net" && element.name === "RESV",
      ),
    ).toEqual([])
    await expect(comparisonSvg).toMatchSvgSnapshot(import.meta.path)
  },
  { timeout: 40_000 },
)
