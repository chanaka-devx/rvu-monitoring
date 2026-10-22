const fs = require('node:fs');
const path = require('node:path');

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function listModules(rootDir) {
  const modulesDir = path.join(rootDir, 'modules');
  if (!fs.existsSync(modulesDir)) {
    return [];
  }

  return fs
    .readdirSync(modulesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

const bannedDomainPackages = [
  '@nestjs',
  '@mikro-orm',
  '@prisma',
  'better-sqlite3',
  'drizzle-orm',
  'ioredis',
  'knex',
  'mongodb',
  'mongoose',
  'mysql2?',
  'pg',
  'prisma',
  'redis',
  'sequelize',
  'sqlite3?',
  'typeorm'
];

const bannedDomainDependencies = [
  '^(?:node:)?(?:fs|net)(?:/|$)',
  ...bannedDomainPackages.flatMap((packageName) => [
    `^${packageName}(?:/|$)`,
    `(^|/)node_modules/${packageName}(?:/|$)`
  ])
];

function buildConfig(rootDir = process.cwd()) {
  const moduleNames = listModules(rootDir);
  const forbidden = [];

  for (const name of moduleNames) {
    const escapedName = escapeRegExp(name);

    forbidden.push({
      name: `module-${name}-domain-no-external-frameworks`,
      comment:
        'Domain code must stay free of NestJS, ORM/database packages, node:fs and node:net.',
      severity: 'error',
      from: { path: `^modules/${escapedName}/domain/` },
      to: { path: bannedDomainDependencies }
    });

    forbidden.push({
      name: `module-${name}-domain-no-other-modules`,
      comment: 'Domain code must not import another module, not even its public API.',
      severity: 'error',
      from: { path: `^modules/${escapedName}/domain/` },
      to: { path: `^modules/(?!${escapedName}/).+` }
    });

    forbidden.push({
      name: `module-${name}-application-boundaries`,
      comment:
        'Application code may only import its own domain/application code and the shared kernel.',
      severity: 'error',
      from: { path: `^modules/${escapedName}/application/` },
      to: {
        path: `^(?!modules/${escapedName}/(?:application|domain)/)(?!packages/shared-kernel/).+`
      }
    });

    for (const otherName of moduleNames) {
      if (otherName === name) {
        continue;
      }

      const escapedOtherName = escapeRegExp(otherName);
      forbidden.push({
        name: `module-${name}-may-import-${otherName}-only-via-public-api`,
        comment: `Module ${name} may import module ${otherName} only through modules/${otherName}/public-api.ts.`,
        severity: 'error',
        from: { path: `^modules/${escapedName}/` },
        to: { path: `^modules/${escapedOtherName}/(?!public-api\\.ts$).+` }
      });
    }
  }

  forbidden.push({
    name: 'apps-no-workspace-internals',
    comment: 'Applications must not import modules or packages directly.',
    severity: 'error',
    from: { path: '^apps/' },
    to: { path: '^(?:modules|packages)/' }
  });

  forbidden.push({
    name: 'no-circular',
    comment: 'Circular dependencies are not allowed.',
    severity: 'error',
    from: {},
    to: { circular: true }
  });

  return {
    forbidden,
    options: {
      doNotFollow: { path: '(^|/)node_modules/' },
      exclude: { path: '(^|/)(node_modules|dist|coverage|\\.turbo)/' }
    }
  };
}

module.exports = buildConfig(process.cwd());
