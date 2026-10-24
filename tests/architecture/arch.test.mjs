import { describe, expect, it } from 'vitest';
import path from 'node:path';
import {
  fixturesRoot,
  runDepcruise,
  runDepcruiseWithLinkedPackages,
  runDepcruiseWithResolvedExternals,
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

  it('rejects a resolved node_modules NestJS import in domain code', () => {
    const { report } = runDepcruiseWithResolvedExternals('domain-nest-resolved', {
      '@nestjs/common': path.join('stub-package')
    });

    const violations = report.summary.violations.filter(
      (violation) => violation.rule?.name === 'module-alpha-domain-no-external-frameworks'
    );

    expect(violations).toHaveLength(1);
    expect(violations[0].to).toContain('node_modules/@nestjs/common');
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

  it('rejects a production file importing the testing package by package name and by relative path', () => {
    const { report } = runFixture('testing-package-in-production');

    const froms = violationFromPaths(report, 'testing-package-only-from-tests').sort();

    expect(violationRuleNames(report)).toContain('testing-package-only-from-tests');
    expect(froms).toEqual(['apps/api/src/bad-name.ts', 'apps/api/src/bad-path.ts']);
  });

  it('rejects a production file importing test tooling', () => {
    const { report } = runFixture('test-tooling-in-production');

    const froms = [...new Set(violationFromPaths(report, 'test-tooling-only-from-tests'))];

    expect(violationRuleNames(report)).toContain('test-tooling-only-from-tests');
    expect(froms).toEqual(['modules/sample/domain/bad.ts']);
  });

  it('keeps the allowed test-support edges in the clean fixture', () => {
    const { report } = runFixture('clean');

    const modules = new Map(report.modules.map((module) => [module.source, module]));
    const namesOf = (source) =>
      (modules.get(source)?.dependencies ?? []).map((dependency) => dependency.resolved ?? dependency.name);
    const hasDependency = (source, pattern) => namesOf(source).some((name) => pattern.test(name));

    expect(hasDependency('packages/testing/src/index.ts', /(^|\/)fast-check(?:\/|$)/)).toBe(true);
    expect(hasDependency('modules/beta/domain/beta.test.ts', /^@rvu\/testing(?:\/|$)|\/@rvu\/testing\//)).toBe(true);
    expect(hasDependency('modules/beta/domain/beta.test.ts', /(^|\/)vitest(?:\/|$)/)).toBe(true);
    expect(hasDependency('tests/harness/test-support.ts', /packages\/testing/)).toBe(true);
  });

  it('fails the architecture command on a deliberately illegal fixture', () => {
    const { status } = runDepcruise(path.join(fixturesRoot, 'domain-nest'), {
      outputType: 'err'
    });

    expect(status).not.toBe(0);
  });
});
