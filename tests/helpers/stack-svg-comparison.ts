import { stackSvgsHorizontally } from "stack-svgs"

export function stackAltiumAndCircuitJsonSvgs({
  altiumSvg,
  circuitJsonSvg,
  label,
}: {
  altiumSvg: string
  circuitJsonSvg: string
  label: string
}): string {
  return stackSvgsHorizontally(
    [altiumSvg, circuitJsonSvg].map(useViewBoxDimensions),
    {
      gap: 24,
      normalizeSize: true,
      targetSize: 800,
      rootAttributes: {
        "aria-label": `${label}: altiumts source on left, Circuit JSON on right`,
        role: "img",
      },
    },
  )
}

function useViewBoxDimensions(svg: string): string {
  const openingTag = svg.match(/<svg\b[^>]*>/u)?.[0]
  if (!openingTag) return svg

  const viewBox = openingTag.match(/\bviewBox\s*=\s*(?:"([^"]*)"|'([^']*)')/u)
  const dimensions = (viewBox?.[1] ?? viewBox?.[2])
    ?.trim()
    .split(/[\s,]+/u)
    .map(Number)
  const viewBoxWidth = dimensions?.[2]
  const viewBoxHeight = dimensions?.[3]
  if (
    dimensions?.length !== 4 ||
    !dimensions.every(Number.isFinite) ||
    viewBoxWidth === undefined ||
    viewBoxHeight === undefined ||
    viewBoxWidth <= 0 ||
    viewBoxHeight <= 0
  ) {
    return svg
  }

  const normalizedOpeningTag = openingTag.replace(
    /\s+(?:width|height)\s*=\s*(?:"[^"]*"|'[^']*')/gu,
    "",
  )
  return svg.replace(openingTag, normalizedOpeningTag)
}
