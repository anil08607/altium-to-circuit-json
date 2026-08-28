import type { AltiumPoint } from "altiumts"

export function stitchConnectedAltiumPaths({
  paths,
  maxEndpointGapMils,
}: {
  paths: AltiumPoint[][]
  maxEndpointGapMils: number
}): AltiumPoint[][] {
  const remaining = paths.map((path) => [...path])
  const stitchedPaths: AltiumPoint[][] = []

  while (remaining.length > 0) {
    const path = remaining.shift()
    if (!path) break
    while (appendConnectedPath({ path, remaining, maxEndpointGapMils })) {
      // Continue until neither end can be extended.
    }
    stitchedPaths.push(path)
  }

  return stitchedPaths
}

function appendConnectedPath({
  path,
  remaining,
  maxEndpointGapMils,
}: {
  path: AltiumPoint[]
  remaining: AltiumPoint[][]
  maxEndpointGapMils: number
}): boolean {
  const pathStart = path[0]
  const pathEnd = path.at(-1)
  if (!pathStart || !pathEnd) return false

  for (const [index, candidate] of remaining.entries()) {
    const candidateStart = candidate[0]
    const candidateEnd = candidate.at(-1)
    if (!candidateStart || !candidateEnd) continue

    if (
      pointsApproximatelyEqual({
        left: pathEnd,
        right: candidateStart,
        maxEndpointGapMils,
      })
    ) {
      path.push(...candidate.slice(1))
    } else if (
      pointsApproximatelyEqual({
        left: pathEnd,
        right: candidateEnd,
        maxEndpointGapMils,
      })
    ) {
      path.push(...candidate.toReversed().slice(1))
    } else if (
      pointsApproximatelyEqual({
        left: pathStart,
        right: candidateEnd,
        maxEndpointGapMils,
      })
    ) {
      path.unshift(...candidate.slice(0, -1))
    } else if (
      pointsApproximatelyEqual({
        left: pathStart,
        right: candidateStart,
        maxEndpointGapMils,
      })
    ) {
      path.unshift(...candidate.toReversed().slice(0, -1))
    } else {
      continue
    }

    remaining.splice(index, 1)
    return true
  }

  return false
}

function pointsApproximatelyEqual({
  left,
  right,
  maxEndpointGapMils,
}: {
  left: AltiumPoint
  right: AltiumPoint
  maxEndpointGapMils: number
}): boolean {
  return (
    Math.abs(left.x - right.x) <= maxEndpointGapMils &&
    Math.abs(left.y - right.y) <= maxEndpointGapMils
  )
}
