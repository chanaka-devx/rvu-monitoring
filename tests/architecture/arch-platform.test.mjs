import { describe, expect, it } from 'vitest';
import path from 'node:path';
import {
  fixturesRoot,
  runDepcruise,
  runDepcruiseWithResolvedExternals,
  violationRuleNames
} from './helpers.mjs';

function runFixture(name) {
  return runDepcruise(path.join(fixturesRoot, name));
}

describe('architecture guardrails (platform boundary)', () => {
  it('rejects platform importing a workspace package other than shared-kernel', () => {
    const { report } = runFixture('platform-imports-testing');

    expect(violationRuleNames(report)).toContain('platform-only-shared-kernel');
  });

  it('rejects a resolved node_modules NestJS import in the platform package', () => {
    const { report } = runDepcruiseWithResolvedExternals('platform-nest-resolved', {
      '@nestjs/common': path.join('stub-package')
    });

    const violations = report.summary.violations.filter(
      (violation) => violation.rule?.name === 'platform-no-banned-frameworks'
    );

    expect(violations).toHaveLength(1);
    expect(violations[0].to).toContain('node_modules/@nestjs/common');
  });

  it('rejects domain code importing the platform package', () => {
    const { report } = runFixture('domain-platform');

    expect(violationRuleNames(report)).toContain('modules-domain-application-no-db-runtime');
  });
});
