import { expect, test } from "bun:test"
import { getImportedPcbBoard } from "../helpers/get-imported-pcb-board"

test("SimpleFOC Mini uses its closed keepout contour as the board outline", async () => {
  const board = await getImportedPcbBoard({
    filename: "simplefocmini-2024-04-26.PcbDoc",
  })

  expect(board.shape).toBe("polygon")
  expect(board.outline?.length).toBeGreaterThan(10)
  expect(board.width).toBeCloseTo(26.083, 2)
  expect(board.height).toBeCloseTo(20.998, 2)
})
