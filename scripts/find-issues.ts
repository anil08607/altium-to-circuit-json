import { parseAltiumFile, AltiumTrackRecord, AltiumRegionRecord, AltiumFillRecord, AltiumTextRecord, AltiumArcRecord, AltiumPolygonRecord, AltiumPadRecord } from "altiumts"
import { mapAltiumCopperLayer } from "../lib/pcb/map-altium-copper-layer"
import * as fs from "fs"
import * as path from "path"

const FIXTURES_DIR = path.join(__dirname, "../tests/fixtures/downloaded")
const files = fs.readdirSync(FIXTURES_DIR).filter(f => f.endsWith('.PcbDoc'))

const issues = new Set<string>()

function normalizeLayer(layer: string | undefined): string {
  return (layer ?? "").replace(/[\s_.-]+/gu, "").toUpperCase()
}

function isKeepoutLayer(layer: string | undefined): boolean {
  return normalizeLayer(layer) === "KEEPOUT"
}

function isCourtyardLayer(layer: string | undefined): boolean {
  const normalized = normalizeLayer(layer)
  return normalized === "MECHANICAL15" || normalized === "MECHANICAL16"
}

function isOverlayLayer(layer: string | undefined): boolean {
  const normalized = normalizeLayer(layer)
  return normalized === "TOPOVERLAY" || normalized === "BOTTOMOVERLAY"
}



for (const file of files) {
  const filepath = path.join(FIXTURES_DIR, file)
  const buffer = fs.readFileSync(filepath)
  try {
    const doc = parseAltiumFile(buffer).document as any
    
    // Check cutouts
    for (const cutout of doc.boardGeometry.cutouts) {
      if (cutout.outline.points.length < 3) {
        issues.add("UnsupportedBoardCutout_LessThan3Points")
      }
    }
    
    for (const record of doc.records) {
      const layer = record.getDecoded("LAYER")
      
      if (record instanceof AltiumTrackRecord) {
        if (isKeepoutLayer(layer)) issues.add("UnsupportedKeepoutTrack")
        else if (!isCourtyardLayer(layer) && !isOverlayLayer(layer) && !mapAltiumCopperLayer(layer)) {
          issues.add(`UnsupportedMechanicalTrack_${normalizeLayer(layer)}`)
        }
      }
      
      if (record instanceof AltiumArcRecord) {
        if (isKeepoutLayer(layer)) { /* Circular keepout is supported */ }
        else if (!isCourtyardLayer(layer) && !isOverlayLayer(layer) && !mapAltiumCopperLayer(layer)) {
          issues.add(`UnsupportedMechanicalArc_${normalizeLayer(layer)}`)
        }
      }
      
      if (record instanceof AltiumRegionRecord) {
        if (isKeepoutLayer(layer)) {
          issues.add("UnsupportedKeepoutRegion")
        } else if (!isCourtyardLayer(layer) && !mapAltiumCopperLayer(layer)) {
          issues.add(`UnsupportedMechanicalRegion_${normalizeLayer(layer)}`)
        } else if (!isCourtyardLayer(layer) && record.recordKind === "Region" && record.regionKind !== "COPPER" && record.regionKind !== "POLYGON_CUTOUT") {
          issues.add(`UnsupportedRegionKind_${record.regionKind}`)
        }
      }
      
      if (record instanceof AltiumFillRecord) {
        if (isKeepoutLayer(layer)) issues.add("UnsupportedKeepoutFill")
        else if (!isOverlayLayer(layer) && !mapAltiumCopperLayer(layer)) {
          issues.add(`UnsupportedMechanicalFill_${normalizeLayer(layer)}`)
        }
      }
      
      if (record instanceof AltiumTextRecord) {
        if (isKeepoutLayer(layer)) issues.add("UnsupportedKeepoutText")
        else if (!isOverlayLayer(layer) && !mapAltiumCopperLayer(layer)) {
          issues.add(`UnsupportedMechanicalText_${normalizeLayer(layer)}`)
        }
      }

      if (record instanceof AltiumPolygonRecord) {
        if (record.shelved === true) issues.add("UnsupportedShelvedPolygon")
      }

      if (record instanceof AltiumPadRecord) {
        const shape = (record.shape ?? "ROUND").replace(/[\s_-]+/gu, "").toUpperCase()
        if (!["ROUND", "CIRCLE", "OVAL", "SQUARE"].includes(shape) && !shape.includes("RECT") && !shape.includes("OCTAGON")) {
          issues.add(`UnsupportedPadShape_${shape}`)
        }
      }
    }
  } catch (e) {
    console.error(`Error parsing ${file}: ${e}`)
  }
}

console.log(JSON.stringify(Array.from(issues), null, 2))
