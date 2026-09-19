import { expect, test } from "bun:test"
import { stackAltiumAndCircuitJsonSvgs } from "./stack-svg-comparison"

test("preserves each SVG viewBox aspect ratio while stacking", () => {
  const wideViewBoxInSquareViewport = [
    '<svg width="600" height="600" viewBox="0 0 1200 600">',
    '<rect width="1200" height="600"/>',
    "</svg>",
  ].join("")
  const matchingViewport = [
    '<svg width="800" height="400" viewBox="0 0 800 400">',
    '<rect width="800" height="400"/>',
    "</svg>",
  ].join("")

  const stacked = stackAltiumAndCircuitJsonSvgs({
    altiumSvg: wideViewBoxInSquareViewport,
    circuitJsonSvg: matchingViewport,
    label: "aspect-ratio fixture",
  })

  const scales = [...stacked.matchAll(/scale\(([^,]+), ([^)]+)\)/gu)]
  expect(scales).toHaveLength(2)
  for (const scale of scales) {
    expect(Number(scale[1])).toBeCloseTo(Number(scale[2]), 12)
  }
  expect(stacked).toContain('width="1624" height="400"')
})
