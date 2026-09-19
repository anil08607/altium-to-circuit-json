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
    [altiumSvg, circuitJsonSvg].map(normalizeSvgViewport),
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

function normalizeSvgViewport(svg: string): string {
  const openingTag = svg.match(/<svg\b[^>]*>/u)?.[0]
  if (!openingTag) return svg

  const explicitWidth = Number(getSvgAttribute(openingTag, "width"))
  const explicitHeight = Number(getSvgAttribute(openingTag, "height"))
  const viewBox = getSvgAttribute(openingTag, "viewBox")
  const dimensions = viewBox
    ? viewBox
        .trim()
        .split(/[\s,]+/u)
        .map(Number)
    : [0, 0, explicitWidth, explicitHeight]
  if (dimensions.length !== 4 || !dimensions.every(Number.isFinite)) {
    return svg
  }
  const [viewBoxMinX, viewBoxMinY, viewBoxWidth, viewBoxHeight] =
    dimensions as [number, number, number, number]
  if (viewBoxWidth <= 0 || viewBoxHeight <= 0) return svg

  const openingTagWithoutSize = openingTag.replace(
    /\s+(?:width|height)\s*=\s*(?:"[^"]*"|'[^']*')/gu,
    "",
  )
  const normalizedOpeningTag = viewBox
    ? openingTagWithoutSize
    : setSvgAttributes(openingTagWithoutSize, {
        viewBox: dimensions.join(" "),
      })

  let normalizedSvg = svg.replace(openingTag, normalizedOpeningTag)
  const firstElement = normalizedSvg
    .slice(normalizedOpeningTag.length)
    .match(/^\s*(?:<title\b[^>]*>[\s\S]*?<\/title>\s*)?(<rect\b[^>]*>)/u)?.[1]
  if (
    firstElement &&
    getSvgAttribute(firstElement, "width") === "100%" &&
    getSvgAttribute(firstElement, "height") === "100%"
  ) {
    normalizedSvg = normalizedSvg.replace(
      firstElement,
      setSvgAttributes(firstElement, {
        width: viewBoxWidth,
        height: viewBoxHeight,
        x: viewBoxMinX,
        y: viewBoxMinY,
      }),
    )
  }
  return normalizedSvg
}

function getSvgAttribute(tag: string, name: string): string | undefined {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")
  const match = tag.match(
    new RegExp(`\\b${escapedName}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "u"),
  )
  return match?.[1] ?? match?.[2]
}

function setSvgAttributes(
  tag: string,
  attributes: Record<string, string | number>,
): string {
  return Object.entries(attributes).reduce((result, [name, value]) => {
    const attributePattern = new RegExp(
      `\\b${name}\\s*=\\s*(?:"[^"]*"|'[^']*')`,
      "u",
    )
    return attributePattern.test(result)
      ? result.replace(attributePattern, `${name}="${value}"`)
      : result.replace(/\s*\/?>$/u, ` ${name}="${value}"$&`)
  }, tag)
}
