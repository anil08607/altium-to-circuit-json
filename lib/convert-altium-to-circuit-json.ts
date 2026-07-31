import {
  AltiumBinaryPcbDoc,
  AltiumPcbDoc,
  type AltiumPcbDocument,
  AltiumSchDoc,
  parseAltiumFile,
  parseAltiumPcbDoc,
  parseAltiumSchDoc,
} from "altiumts"
import type { AnyCircuitElement } from "circuit-json"
import {
  type ConvertAltiumPcbDocOptions,
  convertAltiumPcbDocToCircuitJson,
} from "./convert-altium-pcb-doc-to-circuit-json"
import {
  type ConvertAltiumSchDocOptions,
  convertAltiumSchDocToCircuitJson,
} from "./convert-altium-sch-doc-to-circuit-json"

export type AltiumSourceType = "auto" | "pcb" | "schematic"

export interface ConvertAltiumToCircuitJsonOptions {
  pcb?: ConvertAltiumPcbDocOptions
  schematic?: ConvertAltiumSchDocOptions
  sourceType?: AltiumSourceType
}

export type SupportedAltiumDocument = AltiumPcbDocument | AltiumSchDoc

export function convertAltiumToCircuitJson(
  source: ArrayBuffer | Uint8Array | string,
  options: ConvertAltiumToCircuitJsonOptions = {},
): AnyCircuitElement[] {
  const sourceType = options.sourceType ?? "auto"

  if (sourceType === "pcb") {
    if (typeof source === "string") {
      return convertAltiumPcbDocToCircuitJson(
        parseAltiumPcbDoc(source),
        options.pcb,
      )
    }
    const { document } = parseAltiumFile(toUint8Array(source))
    if (
      !(document instanceof AltiumPcbDoc) &&
      !(document instanceof AltiumBinaryPcbDoc)
    ) {
      throw new TypeError(
        `Expected an Altium PCB document, got ${document.type}`,
      )
    }
    return convertAltiumPcbDocToCircuitJson(document, options.pcb)
  }
  if (sourceType === "schematic") {
    return convertAltiumSchDocToCircuitJson(
      parseAltiumSchDoc(normalizeSchematicSource(source)),
      options.schematic,
    )
  }

  const bytes = toUint8Array(source)
  const { document } = parseAltiumFile(bytes)
  return convertAltiumDocumentToCircuitJson(document, options)
}

export function convertAltiumDocumentToCircuitJson(
  document: unknown,
  options: ConvertAltiumToCircuitJsonOptions = {},
): AnyCircuitElement[] {
  if (document instanceof AltiumSchDoc) {
    return convertAltiumSchDocToCircuitJson(document, options.schematic)
  }
  if (
    document instanceof AltiumPcbDoc ||
    document instanceof AltiumBinaryPcbDoc
  ) {
    return convertAltiumPcbDocToCircuitJson(document, options.pcb)
  }
  const type =
    typeof document === "object" && document !== null && "type" in document
      ? String(document.type)
      : typeof document
  throw new TypeError(`Unsupported Altium document type: ${type}`)
}

function toUint8Array(source: ArrayBuffer | Uint8Array | string): Uint8Array {
  if (typeof source === "string") return new TextEncoder().encode(source)
  if (source instanceof Uint8Array) return source
  return new Uint8Array(source)
}

function normalizeSchematicSource(
  source: ArrayBuffer | Uint8Array | string,
): Uint8Array | string {
  return source instanceof ArrayBuffer ? new Uint8Array(source) : source
}
