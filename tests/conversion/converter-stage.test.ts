import { expect, test } from "bun:test"
import { parseAltiumSchDoc } from "altiumts"
import { ConverterStage } from "../../lib/converter/ConverterStage"

class CountingStage extends ConverterStage<number, number> {
  calls = 0

  _step(): void {
    this.calls++
    this.finished = this.calls >= this.input
  }

  getOutput(): number {
    return this.calls
  }
}

function createCountingStage(finishAfter: number): CountingStage {
  return new CountingStage(finishAfter, {
    document: parseAltiumSchDoc("|RECORD=31|CUSTOMX=100|CUSTOMY=100"),
    elements: [],
    options: {},
  })
}

test.each([1, 1_000])(
  "finished stages ignore step calls after completing in %i iterations",
  (finishAfter) => {
    const stage = createCountingStage(finishAfter)
    stage.runUntilFinished()

    for (let index = 0; index <= stage.maxIterations; index++) stage.step()
    stage.runUntilFinished()

    expect(stage.finished).toBe(true)
    expect(stage.iteration).toBe(finishAfter)
    expect(stage.getOutput()).toBe(finishAfter)
  },
)

test("unfinished stages can resume after a manual step", () => {
  const stage = createCountingStage(3)
  stage.step()
  expect(stage.finished).toBe(false)
  expect(stage.iteration).toBe(1)

  stage.runUntilFinished()

  expect(stage.finished).toBe(true)
  expect(stage.iteration).toBe(3)
  expect(stage.getOutput()).toBe(3)
})

test("unfinished stages still stop at the iteration limit", () => {
  const stage = createCountingStage(Number.POSITIVE_INFINITY)

  expect(() => stage.runUntilFinished()).toThrow(
    `CountingStage exceeded ${stage.maxIterations} iterations`,
  )
  expect(stage.finished).toBe(false)
  expect(stage.iteration).toBe(stage.maxIterations + 1)
  expect(stage.getOutput()).toBe(stage.maxIterations)
})
