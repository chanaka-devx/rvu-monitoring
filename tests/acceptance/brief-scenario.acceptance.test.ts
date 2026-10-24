import { DecimalValue } from '../../packages/shared-kernel/src';
import { briefScenario, expectOk } from '../../packages/testing/src';
import { describe, expect, it } from 'vitest';

const providerTarget = expectOk(DecimalValue.parse('500'));
const beforeWrvu = expectOk(DecimalValue.parse('360'));
const afterWrvu = expectOk(DecimalValue.parse('368'));
const adjustmentWrvu = expectOk(DecimalValue.parse('8'));

function wrvuOf(line: { code: string; units: number }): DecimalValue {
  const entry = briefScenario.rvuEntries.find((candidate) => candidate.code === line.code);
  if (entry === undefined) {
    throw new Error(`no rvu entry for code ${line.code}`);
  }
  return entry.workRvu.multiply(expectOk(DecimalValue.fromInteger(line.units)));
}

describe('brief scenario arithmetic (fixture only)', () => {
  it('sums 360 wRVUs across confirmed lines and counts 3 review lines outside the total', () => {
    const { lines, resolutions } = briefScenario;
    const confirmedLines = lines.filter((line) => line.status === 'final');
    const reviewLines = lines.filter((line) => line.status === 'pending');

    expect(DecimalValue.sum(confirmedLines.map(wrvuOf)).equals(beforeWrvu)).toBe(true);
    expect(reviewLines).toHaveLength(3);
    expect(reviewLines).toHaveLength(lines.length - confirmedLines.length);

    const confirmedIds = new Set(confirmedLines.map((line) => line.sourceLineId));
    const reviewIds = new Set(reviewLines.map((line) => line.sourceLineId));
    for (const resolution of resolutions) {
      expect(reviewIds.has(resolution.sourceLineId)).toBe(true);
      expect(confirmedIds.has(resolution.sourceLineId)).toBe(false);
    }
  });

  it('reads 360 as 72.00 percent of the 500 wRVU provider target', () => {
    expect(expectOk(beforeWrvu.percentOf(providerTarget, 2)).toFixed(2)).toBe('72.00');
    expect(briefScenario.expected.before.percentOfTarget.toFixed(2)).toBe('72.00');
  });

  it('credits two review lines at 4 wRVUs each, excludes one, and confirms 368 wRVUs', () => {
    const { resolutions, expected } = briefScenario;
    const credited = resolutions.filter((resolution) => resolution.outcome.kind === 'credited');
    const excluded = resolutions.filter((resolution) => resolution.outcome.kind === 'excluded');
    expect(credited).toHaveLength(2);
    expect(excluded).toHaveLength(1);

    const adjustment = DecimalValue.sum(
      credited.map((resolution) =>
        resolution.outcome.kind === 'credited' ? resolution.outcome.wrvu : unreachable()
      )
    );
    expect(adjustment.equals(adjustmentWrvu)).toBe(true);
    expect(expected.after.adjustmentWrvu.equals(adjustmentWrvu)).toBe(true);
    expect(expected.after.confirmedWrvu.equals(afterWrvu)).toBe(true);
  });

  it('reads 368 as 73.60 percent, 0 unresolved and 1 excluded line', () => {
    const { expected } = briefScenario;
    expect(expectOk(afterWrvu.percentOf(providerTarget, 2)).toFixed(2)).toBe('73.60');
    expect(expected.after.unresolved).toBe(0);
    expect(expected.after.excludedLines).toBe(1);
  });
});

describe.skip('end-to-end (enabled in P11)', () => {
  it.todo('imports the synthetic CSV through the ingestion pipeline');
  it.todo('shows the dashboard at 72 percent with 3 unresolved items');
  it.todo('resolves two review lines and excludes one with a recorded reason');
  it.todo('shows 73.6 percent and traces the 8 wRVU adjustment to its source lines');
});

function unreachable(): never {
  throw new Error('unreachable resolution kind');
}
