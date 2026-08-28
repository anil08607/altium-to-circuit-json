import { expect, test } from "bun:test"
import { getImportedPcbBoard } from "../helpers/get-imported-pcb-board"

test("SimpleFOC Shield uses its closed keepout contour as the board outline", async () => {
  const board = await getImportedPcbBoard({
    filename: "simplefoc-shield-v3.PcbDoc",
  })

  expect(board.shape).toBe("polygon")
  expect(board.outline?.length).toBeGreaterThan(10)
  expect(board.width).toBeCloseTo(55.419, 2)
  expect(board.height).toBeCloseTo(53.255, 2)
})
