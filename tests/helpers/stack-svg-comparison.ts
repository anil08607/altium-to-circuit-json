import { stackSvgsHorizontally } from "stack-svgs"

export function stackAltiumAndCircuitJsonSvgs(
  altiumSvg: string,
  circuitJsonSvg: string,
  label: string,
): string {
  return stackSvgsHorizontally([altiumSvg, circuitJsonSvg], {
    gap: 24,
    normalizeSize: true,
    targetSize: 800,
    rootAttributes: {
      "aria-label": `${label}: altiumts source on left, Circuit JSON on right`,
      role: "img",
    },
  })
}
