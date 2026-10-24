import { DecimalValue } from '@rvu/shared-kernel';
import { expectOk } from './result-helpers';
import { briefScenario } from './brief-scenario';
import { describe, expect, it } from 'vitest';

const fourWrvu = expectOk(DecimalValue.parse('4'));

describe('briefScenario consistency', () => {
  it('resolves each review line exactly once with a review reason', () => {
    const { lines, resolutions } = briefScenario;
    const lineIds = new Set(lines.map((line) => line.sourceLineId));
    for (const resolution of resolutions) {
      expect(lineIds.has(resolution.sourceLineId)).toBe(true);
      expect(resolution.reviewReason.length).toBeGreaterThan(0);
    }
    expect(new Set(resolutions.map((resolution) => resolution.sourceLineId)).size).toBe(
      resolutions.length
    );
  });

  it('credits review lines at 4 wRVUs and records reasons on exclusions', () => {
    const credited = briefScenario.resolutions.filter(
      (resolution) => resolution.outcome.kind === 'credited'
    );
    for (const resolution of credited) {
      if (resolution.outcome.kind !== 'credited') {
        continue;
      }
      expect(resolution.outcome.wrvu.equals(fourWrvu)).toBe(true);
    }
    for (const resolution of briefScenario.resolutions) {
      if (resolution.outcome.kind === 'excluded') {
        expect(resolution.outcome.reason.length).toBeGreaterThan(0);
      }
    }
    expect(credited).toHaveLength(2);
  });
});
