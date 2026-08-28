import { expect } from "bun:test"
import { type AnyCircuitElement, any_circuit_element } from "circuit-json"

export function expectValidImportedPcb({
  circuitJson,
  circuitJsonSvg,
}: {
  circuitJson: AnyCircuitElement[]
  circuitJsonSvg: string
}): void {
  expect(
    circuitJson.filter((element) => element.type === "pcb_board"),
  ).toHaveLength(1)
  expect(
    circuitJson.filter((element) => element.type === "pcb_smtpad").length,
  ).toBeGreaterThan(0)
  expect(
    circuitJson.filter((element) => element.type === "pcb_trace").length,
  ).toBeGreaterThan(0)
  expect(
    circuitJson.every(
      (element) => any_circuit_element.safeParse(element).success,
    ),
  ).toBe(true)
  expect(
    circuitJson
      .filter((element) => element.type === "pcb_silkscreen_text")
      .every((element) => !/^\d+(?:,\d+)+$/u.test(element.text)),
  ).toBe(true)
  expect(circuitJsonSvg).not.toContain("NaN")
}
