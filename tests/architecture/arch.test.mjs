import { describe, expect, it } from 'vitest';
import path from 'node:path';
import {
  fixturesRoot,
  runDepcruise,
  runDepcruiseWithLinkedPackages,
  violationFromPaths,
  violationRuleNames
} from './helpers.mjs';

function runFixture(name) {
  return runDepcruise(path.join(fixturesRoot, name));
}

describe('architecture guardrails', () => {
  it('allows a clean modular-monolith fixture with every allowed edge', () => {
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

  it('rejects an app importing a module internal file', () => {
    const { report } = runFixture('apps-import-module-internal');

    expect(violationRuleNames(report)).toContain('apps-only-module-entrypoints');
  });

  it('rejects an app importing a package internal file through a relative path', () => {
    const { report } = runFixture('apps-import-package-internal');

    expect(violationRuleNames(report)).toContain('apps-only-package-entrypoints');
  });

  it('resolves package and module entry points through node_modules links', () => {
    const { report } = runDepcruiseWithLinkedPackages('apps-package-name-resolution', {
      '@rvu/shared-kernel': path.join('packages', 'shared-kernel'),
      '@rvu/module-sample': path.join('modules', 'sample')
    });

    const packageViolations = violationFromPaths(report, 'apps-only-package-entrypoints');
    const moduleViolations = violationFromPaths(report, 'apps-only-module-entrypoints');

    expect(packageViolations).toContain('apps/api/src/deep.ts');
    expect(packageViolations).not.toContain('apps/api/src/entry.ts');
    expect(moduleViolations).toContain('apps/api/src/module-deep.ts');
    expect(moduleViolations).not.toContain('apps/api/src/module-entry.ts');
  });

  it('rejects modules and packages importing apps', () => {
    const { report } = runFixture('workspace-imports-app');

    expect(violationRuleNames(report)).toContain('workspace-no-app-imports');
  });

  it('rejects shared-kernel importing another workspace package', () => {
    const { report } = runFixture('shared-kernel-imports-contracts');

    expect(violationRuleNames(report)).toContain('shared-kernel-no-workspace-imports');
  });

  it('rejects testing importing a package other than shared-kernel', () => {
    const { report } = runFixture('testing-imports-contracts');

    expect(violationRuleNames(report)).toContain('testing-only-shared-kernel');
  });

  it('rejects contracts importing a package other than shared-kernel', () => {
    const { report } = runFixture('contracts-imports-testing');

    expect(violationRuleNames(report)).toContain('contracts-only-shared-kernel');
  });

  it('rejects domain and application imports from contracts', () => {
    const { report } = runFixture('module-contracts-imports');

    expect(violationRuleNames(report)).toContain('domain-and-application-no-contracts');
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
