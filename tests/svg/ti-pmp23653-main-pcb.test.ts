import { expect, test } from "bun:test"
import { TI_POWER_REFERENCE_PCB_FILENAMES } from "../../scripts/references/reference-manifest"
import { createOpenSourcePcbComparison } from "../helpers/create-open-source-pcb-comparison"
import { expectValidImportedPcb } from "../helpers/expect-valid-imported-pcb"

test(
  "TI PMP23653 main PCB: altiumts SVG on the left, Circuit JSON SVG on the right",
  async () => {
    const { circuitJson, circuitJsonSvg, comparisonSvg } =
      await createOpenSourcePcbComparison({
        filename: TI_POWER_REFERENCE_PCB_FILENAMES.pmp23653Main,
        focusOnBoard: true,
        pcbName: "TI PMP23653 main",
      })

    expectValidImportedPcb({ circuitJson, circuitJsonSvg })
    expect(
      circuitJson.filter(
        (element) =>
          element.type === "pcb_copper_pour" &&
          element.pcb_copper_pour_id.includes("soldermask_opening"),
      ),
    ).toHaveLength(15)
    await expect(comparisonSvg).toMatchSvgSnapshot(import.meta.path)
  },
  { timeout: 40_000 },
)
