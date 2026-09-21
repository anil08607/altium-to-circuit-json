import { expect, test } from "bun:test"
import {
  AltiumPcbDoc,
  AltiumTrackRecord,
  getAltiumBounds,
  parseAltiumBinaryPcbDoc,
  serializeAltiumPcbLayerToSvg,
} from "altiumts"
import { any_circuit_element } from "circuit-json"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { convertAltiumPcbDocToCircuitJson } from "../../../lib"
import { TI_TMDS62LEVM_PCB_FILENAME } from "../../../scripts/references/reference-manifest"
import { readReferenceBytes } from "../../helpers/read-reference"
import { stackAltiumAndCircuitJsonSvgs } from "../../helpers/stack-svg-comparison"

test(
  "TI TMDS62LEVM preserves all standalone solder-mask tracks",
  async () => {
    const document = parseAltiumBinaryPcbDoc(
      await readReferenceBytes(TI_TMDS62LEVM_PCB_FILENAME),
    )
    const circuitJson = convertAltiumPcbDocToCircuitJson(document, {
      includeBoardOutline: false,
      includeComponents: false,
      includeCopperAreas: false,
      includeCourtyards: false,
      includeDimensions: false,
      includeKeepouts: false,
      includePads: false,
      includeSilkscreen: false,
      includeTraces: false,
      includeVias: false,
    })
    const openings = circuitJson.filter(
      (element) => element.type === "pcb_soldermask_opening",
    )
    expect(openings).toHaveLength(317)

    for (const [layer, expectedCount] of [
      ["top", 141],
      ["bottom", 176],
    ] as const) {
      const altiumLayer = `${layer.toUpperCase()}SOLDER`
      const sourceTracks = document.records
        .map((record, index) => ({ record, index }))
        .filter(
          ({ record }) =>
            record instanceof AltiumTrackRecord && record.layer === altiumLayer,
        )
      const layerOpenings = openings.filter(
        (opening) => opening.layer === layer,
      )
      expect(sourceTracks).toHaveLength(expectedCount)
      expect(layerOpenings).toHaveLength(sourceTracks.length)
      expect(
        layerOpenings.map((opening) => opening.pcb_soldermask_opening_id),
      ).toEqual(
        sourceTracks.map(
          ({ index }) => `pcb_soldermask_opening_altium_track_${index}`,
        ),
      )
      expect(
        layerOpenings.every(
          (opening) => any_circuit_element.safeParse(opening).success,
        ),
      ).toBe(true)

      // Isolate the actual decoded strokes, excluding pad/via-generated mask
      // apertures. Fit to the strokes so geometry outside the board stays visible.
      const strokesDocument = new AltiumPcbDoc({
        lines: sourceTracks.map(({ record }) => record),
      })
      const bounds = getAltiumBounds(
        sourceTracks.flatMap(({ record }) => {
          if (
            !(record instanceof AltiumTrackRecord) ||
            !record.start ||
            !record.end ||
            record.widthMils === undefined
          ) {
            throw new Error("Expected a complete source track")
          }
          const radius = record.widthMils / 2
          return [
            {
              x: Math.min(record.start.x, record.end.x) - radius,
              y: Math.min(record.start.y, record.end.y) - radius,
            },
            {
              x: Math.max(record.start.x, record.end.x) + radius,
              y: Math.max(record.start.y, record.end.y) + radius,
            },
          ]
        }),
      )
      if (!bounds) throw new Error("Expected solder-mask stroke bounds")
      const padding =
        Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * 0.05
      const viewBox = {
        x: bounds.minX - padding,
        y: bounds.minY - padding,
        width: bounds.maxX - bounds.minX + 2 * padding,
        height: bounds.maxY - bounds.minY + 2 * padding,
      }
      const maskSvg = convertCircuitJsonToPcbSvg(layerOpenings, {
        layer,
        showSolderMask: true,
        width: 800,
        height: 800,
        viewport: {
          minX: viewBox.x * 0.0254,
          minY: viewBox.y * 0.0254,
          maxX: (viewBox.x + viewBox.width) * 0.0254,
          maxY: (viewBox.y + viewBox.height) * 0.0254,
        },
      })
      expect(maskSvg.match(/data-pcb-soldermask-opening-id=/gu)).toHaveLength(
        expectedCount,
      )
      const comparison = stackAltiumAndCircuitJsonSvgs({
        altiumSvg: serializeAltiumPcbLayerToSvg(strokesDocument, altiumLayer, {
          width: 800,
          height: 800,
          viewBox,
          showBoardOutline: false,
        }),
        circuitJsonSvg: maskSvg,
        label: `TI TMDS62LEVM ${layer} standalone solder-mask tracks`,
      })
      await expect(comparison).toMatchSvgSnapshot(import.meta.path, layer)
    }
  },
  { timeout: 600_000 },
)
