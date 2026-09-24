import type { AltiumToCircuitJsonConverterContext } from "./types"

export abstract class ConverterStage<Input, Output> {
  readonly input: Input
  readonly context: AltiumToCircuitJsonConverterContext
  readonly maxIterations = 1_000
  iteration = 0
  finished = false

  constructor(input: Input, context: AltiumToCircuitJsonConverterContext) {
    this.input = input
    this.context = context
  }

  step(): void {
    if (this.finished) return
    this.iteration++
    if (this.iteration > this.maxIterations) {
      throw new Error(
        `${this.constructor.name} exceeded ${this.maxIterations} iterations`,
      )
    }
    this._step()
  }

  abstract _step(): void

  runUntilFinished(): void {
    while (!this.finished) this.step()
  }

  abstract getOutput(): Output
}
