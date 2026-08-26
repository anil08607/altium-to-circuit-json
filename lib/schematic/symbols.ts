export type ComponentClassification =
  | "capacitor"
  | "crystal"
  | "diode"
  | "ferrite_bead"
  | "inductor"
  | "led"
  | "mosfet"
  | "resistor"
  | "testpoint"
  | "unknown"

export function classifyComponent(params: {
  designator: string
  libraryReference: string
}): ComponentClassification {
  const { designator, libraryReference } = params
  const prefix = designator.match(/^[A-Z]+/iu)?.[0]?.toUpperCase() ?? ""
  const lowerReference = libraryReference.toLowerCase()
  if (prefix === "TP" || lowerReference.includes("testpoint")) {
    return "testpoint"
  }
  if (
    prefix === "Y" ||
    lowerReference.includes("crystal") ||
    /(?:^|[_-])cry(?:\d|[_-]|$)/iu.test(libraryReference)
  ) {
    return "crystal"
  }
  if (lowerReference.includes("mosfet")) return "mosfet"
  if (
    prefix === "FB" ||
    prefix === "FL" ||
    lowerReference.includes("ferrite") ||
    lowerReference.includes("emifilter_ind")
  ) {
    return "ferrite_bead"
  }
  if (prefix === "LED" || lowerReference.includes("led")) return "led"
  if (prefix === "R" || lowerReference.includes("resistor")) return "resistor"
  if (prefix === "C" || /(?:^|[_-])cap(?:[_-]|$)/iu.test(libraryReference)) {
    return "capacitor"
  }
  if (prefix === "L" || lowerReference.includes("inductor")) return "inductor"
  if (prefix === "D" || lowerReference.includes("diode")) return "diode"
  return "unknown"
}

export function getMosfetVariant(libraryReference: string): {
  channel_type: "n" | "p"
  mosfet_mode: "depletion" | "enhancement"
} {
  const lowerReference = libraryReference.toLowerCase()
  const isPChannel =
    /(?:^|[_-])p(?:channel)?(?:[_-]|$)/iu.test(libraryReference) ||
    lowerReference.includes("pmos") ||
    lowerReference.includes("csd25")
  return {
    channel_type: isPChannel ? "p" : "n",
    mosfet_mode: lowerReference.includes("depletion")
      ? "depletion"
      : "enhancement",
  }
}

export function isPolarizedCapacitor(libraryReference: string): boolean {
  return /(?:^|[_-])cap(?:acitor)?[_-]?pol(?:arized)?(?:[_-]|$)/iu.test(
    libraryReference,
  )
}

export function getPrimaryComponentValue(componentValue: string): string {
  return componentValue.split(/[_/\s]+/u).find(Boolean) ?? componentValue
}
