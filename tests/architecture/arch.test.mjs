import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fixturesRoot, runDepcruise, violationRuleNames } from './helpers.mjs';

function runFixture(name) {
  return runDepcruise(path.join(fixturesRoot, name));
}

describe('architecture guardrails', () => {
  it('allows a clean modular-monolith fixture', () => {
    const { report } = runFixture('clean');

    expect(report.summary.violations).toEqual([]);
  });

  it('rejects NestJS imports in domain code', () => {
    const { report } = runFixture('domain-nest');

    expect(violationRuleNames(report)).toContain('module-alpha-domain-no-external-frameworks');
  });

  it('rejects ORM imports in domain code', () => {
    const { report } = runFixture('domain-orm');

    expect(violationRuleNames(report)).toContain('module-alpha-domain-no-external-frameworks');
  });

  it('rejects node:fs imports in domain code', () => {
    const { report } = runFixture('domain-fs');

    expect(violationRuleNames(report)).toContain('module-alpha-domain-no-external-frameworks');
  });

  it('rejects node:net imports in domain code', () => {
    const { report } = runFixture('domain-net');

    expect(violationRuleNames(report)).toContain('module-alpha-domain-no-external-frameworks');
  });

  it('rejects domain imports from another module', () => {
    const { report } = runFixture('domain-cross-module');

    expect(violationRuleNames(report)).toContain('module-alpha-domain-no-other-modules');
  });

  it('rejects application imports from another module', () => {
    const { report } = runFixture('application-cross-module');

    expect(violationRuleNames(report)).toContain('module-alpha-application-boundaries');
  });

  it('rejects application imports from its own infrastructure', () => {
    const { report } = runFixture('application-infrastructure');

    expect(violationRuleNames(report)).toContain('module-alpha-application-boundaries');
  });

  it('rejects a module importing another module internal file', () => {
    const { report } = runFixture('module-internal-import');

    expect(violationRuleNames(report)).toContain(
      'module-alpha-may-import-beta-only-via-public-api'
    );
  });

  it('allows a module importing another module public-api', () => {
    const { report } = runFixture('clean');

    expect(violationRuleNames(report)).not.toContain(
      'module-beta-may-import-alpha-only-via-public-api'
    );
  });

  it('rejects app imports from modules', () => {
    const { report } = runFixture('apps-import-module');

    expect(violationRuleNames(report)).toContain('apps-no-workspace-internals');
  });

  it('rejects app imports from packages', () => {
    const { report } = runFixture('apps-import-package');

    expect(violationRuleNames(report)).toContain('apps-no-workspace-internals');
  });

  it('rejects circular dependencies', () => {
    const { report } = runFixture('circular');

    expect(violationRuleNames(report)).toContain('no-circular');
  });

  it('fails the architecture command on a deliberately illegal fixture', () => {
    const { status } = runDepcruise(path.join(fixturesRoot, 'domain-nest'), {
      outputType: 'err'
    });

    expect(status).not.toBe(0);
  });
});
