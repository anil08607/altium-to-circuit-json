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

test("scales dimension-only SVGs and fills unwrapped backgrounds", () => {
  const altiumSvg = [
    '<svg width="600" height="600" viewBox="-50 -25 200 100">',
    "<title>Altium fixture</title>",
    '<rect width="100%" height="100%" fill="black"/>',
    "</svg>",
  ].join("")
  const circuitJsonSvg = [
    '<svg width="200" height="400">',
    '<rect width="200" height="400" fill="black"/>',
    "</svg>",
  ].join("")

  const stacked = stackAltiumAndCircuitJsonSvgs({
    altiumSvg,
    circuitJsonSvg,
    label: "viewport fixture",
  })

  expect(stacked).toContain('viewBox="0 0 1224 800"')
  expect(stacked).toContain("scale(4, 4)")
  expect(stacked).toContain("scale(2, 2)")
  expect(stacked).toContain('width="200" height="100"')
  expect(stacked).toContain('x="-50" y="-25"')
  expect(stacked).not.toContain('width="100%"')
})
