import { expect, test } from "bun:test"
import { createOpenSourceSchematicComparison } from "../helpers/create-open-source-schematic-comparison"
import { expectValidImportedSchematic } from "../helpers/expect-valid-imported-schematic"

test(
  "HERON PAY-SSM schematic: altiumts SVG on the left, Circuit JSON SVG on the right",
  async () => {
    const { circuitJson, circuitJsonSvg, comparisonSvg } =
      await createOpenSourceSchematicComparison({
        filename: "heron-pay-ssm-top.SchDoc",
        schematicName: "HERON PAY-SSM",
      })

    expectValidImportedSchematic({ circuitJson, circuitJsonSvg })
    await expect(comparisonSvg).toMatchSvgSnapshot(import.meta.path)
  },
  { timeout: 40_000 },
)
