import { describe, expect, it } from 'vitest'
import { runE11 } from '../../eval/suites/e11-recalibration'

// E11 runs in the normal test suite because it needs no model, database or network.
describe('E11 recalibration property run', () => {
  it('follows every calibration rule across 20 synthetic 12-cycle profiles', () => {
    const metric = runE11(20, 12).metrics[0]
    expect(metric?.failures).toEqual([])
    expect(metric?.value).toBe(1)
  })
})
