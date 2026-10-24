const fs = require('node:fs');
const path = require('node:path');

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function listDirectories(rootDir, name) {
  const directory = path.join(rootDir, name);
  if (!fs.existsSync(directory)) {
    return [];
  }

  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function listModules(rootDir) {
  return listDirectories(rootDir, 'modules');
}

function readPackageEntry(packageDir) {
  const packageJsonPath = path.join(packageDir, 'package.json');

  if (!fs.existsSync(packageJsonPath)) {
    return { name: undefined, entry: 'src/index.ts' };
  }

  try {
    const manifest = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const exportsField = manifest.exports && manifest.exports['.'];
    const fromExports =
      typeof exportsField === 'string'
        ? exportsField
        : (exportsField && (exportsField.default ?? exportsField.types)) ?? undefined;
    const candidate = fromExports ?? manifest.main ?? manifest.types ?? './src/index.ts';

    return {
      name: manifest.name,
      entry: toPosix(path.normalize(candidate.replace(/^\.\//, '')))
    };
  } catch {
    return { name: undefined, entry: 'src/index.ts' };
  }
}

function listPackages(rootDir) {
  return listDirectories(rootDir, 'packages').map((name) => {
    const packageDir = path.join(rootDir, 'packages', name);
    const { name: packageName, entry } = readPackageEntry(packageDir);

    return {
      name: packageName,
      entry: toPosix(path.join('packages', name, entry))
    };
  });
}

function buildConfig(rootDir = process.cwd()) {
  const moduleNames = listModules(rootDir);
  const packages = listPackages(rootDir);
  const forbidden = [];

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

  const modulePackageNames = moduleNames
    .map((name) => readPackageEntry(path.join(rootDir, 'modules', name)).name)
    .filter(Boolean);
  const allowedModuleEntries = [
    ...moduleNames.flatMap((name) => {
      const escapedName = escapeRegExp(name);
      return [
        `modules/${escapedName}/public-api\\.ts`,
        `modules/${escapedName}/${escapedName}\\.module\\.ts`
      ];
    }),
    ...modulePackageNames.map((packageName) => escapeRegExp(packageName))
  ];
  const moduleEntryRule = {
    name: 'apps-only-module-entrypoints',
    comment:
      'Applications may import a module only through its public-api.ts or its <name>.module.ts wiring file.',
    severity: 'error',
    from: { path: '^apps/' },
    to: {
      path:
        modulePackageNames.length > 0
          ? `^(?:modules/|(?:${modulePackageNames.map(escapeRegExp).join('|')})/)`
          : '^modules/'
    }
  };
  if (allowedModuleEntries.length > 0) {
    moduleEntryRule.to.pathNot = `^(?:${allowedModuleEntries.join('|')})$`;
  }
  forbidden.push(moduleEntryRule);

  const packageNames = packages.map((entry) => entry.name).filter(Boolean);
  const allowedPackageEntries = [
    ...packages.map((entry) => escapeRegExp(entry.entry)),
    ...packageNames.map((packageName) => escapeRegExp(packageName))
  ];
  const packageEntryRule = {
    name: 'apps-only-package-entrypoints',
    comment:
      'Applications may import a workspace package only through its package entry point, never a deep src/** path.',
    severity: 'error',
    from: { path: '^apps/' },
    to: {
      path:
        packageNames.length > 0
          ? `^(?:packages/|(?:${packageNames.map(escapeRegExp).join('|')})/)`
          : '^packages/'
    }
  };
  if (allowedPackageEntries.length > 0) {
    packageEntryRule.to.pathNot = `^(?:${allowedPackageEntries.join('|')})$`;
  }
  forbidden.push(packageEntryRule);

  forbidden.push({
    name: 'workspace-no-app-imports',
    comment: 'Modules and packages must never import an application.',
    severity: 'error',
    from: { path: '^(?:modules|packages)/' },
    to: { path: '^apps/' }
  });

  forbidden.push({
    name: 'shared-kernel-no-workspace-imports',
    comment: 'The shared kernel must not import any other workspace code.',
    severity: 'error',
    from: { path: '^packages/shared-kernel/' },
    to: {
      path: '^(?:apps|modules|packages)/',
      pathNot: '^packages/shared-kernel/'
    }
  });

  forbidden.push({
    name: 'testing-only-shared-kernel',
    comment: 'The testing package may import only the shared kernel.',
    severity: 'error',
    from: { path: '^packages/testing/' },
    to: {
      path: '^(?:apps|modules|packages)/',
      pathNot: '^packages/(?:testing|shared-kernel)/'
    }
  });

  forbidden.push({
    name: 'contracts-only-shared-kernel',
    comment: 'The contracts package may import only the shared kernel.',
    severity: 'error',
    from: { path: '^packages/contracts/' },
    to: {
      path: '^(?:apps|modules|packages)/',
      pathNot: '^packages/(?:contracts|shared-kernel)/'
    }
  });

  forbidden.push({
    name: 'platform-only-shared-kernel',
    comment:
      'The platform package may import only the shared kernel among workspace code. Test files may use @rvu/testing.',
    severity: 'error',
    from: { path: '^packages/platform/', pathNot: '\\.(?:int\\.)?test\\.tsx?$' },
    to: {
      path: '^(?:apps|modules|packages)/',
      pathNot: '^packages/(?:platform|shared-kernel)/'
    }
  });

  forbidden.push({
    name: 'platform-no-banned-frameworks',
    comment:
      'The platform package must not depend on NestJS or HTTP/API framework packages.',
    severity: 'error',
    from: { path: '^packages/platform/' },
    to: {
      path: bannedDomainPackages
        .filter((packageName) => packageName !== 'pg')
        .flatMap((packageName) => [
          `^${packageName}(?:/|$)`,
          `(^|/)node_modules/${packageName}(?:/|$)`,
          `(^|/)node_modules/[^/]+/node_modules/${packageName}(?:/|$)`
        ])
    }
  });

  forbidden.push({
    name: 'modules-domain-application-no-db-runtime',
    comment:
      'Domain and application code must not import the platform package or database runtime libraries. Use ports and let infrastructure wire them.',
    severity: 'error',
    from: { path: '^modules/[^/]+/(?:domain|application)/' },
    to: {
      path: [
        '^packages/platform/',
        ...['kysely', 'zod'].flatMap((packageName) => [
          `^${packageName}(?:/|$)`,
          `(^|/)node_modules/${packageName}(?:/|$)`,
          `(^|/)node_modules/[^/]+/node_modules/${packageName}(?:/|$)`
        ])
      ]
    }
  });

  forbidden.push({
    name: 'pg-and-job-queues-only-in-platform-or-tests',
    comment:
      'pg, pg-boss and database drivers are only wired in the platform or testing packages. Test files are exempt.',
    severity: 'error',
    from: {
      path: '^.*',
      pathNot: '(?:^packages/(?:platform|testing)/|\\.(?:int\\.)?test\\.(?:ts|tsx|mjs)$)'
    },
    to: {
      path: ['pg-boss'].flatMap((packageName) => [
        `^${packageName}(?:/|$)`,
        `(^|/)node_modules/${packageName}(?:/|$)`,
        `(^|/)node_modules/[^/]+/node_modules/${packageName}(?:/|$)`
      ])
    }
  });

  forbidden.push({
    name: 'domain-and-application-no-contracts',
    comment:
      'Domain and application code must not import packages/contracts. Define a port and implement it in infrastructure instead.',
    severity: 'error',
    from: { path: '^modules/[^/]+/(?:domain|application)/' },
    to: { path: '^packages/contracts/' }
  });

  forbidden.push({
    name: 'testing-package-only-from-tests',
    comment:
      'Only test files may import @rvu/testing. Production code must never depend on test helpers, synthetic data or fake clocks. packages/testing itself is the provider and may import its own code.',
    severity: 'error',
    from: {
      path: '^(?:apps|modules|packages)/',
      pathNot: String.raw`(?:\.(?:int\.)?test\.(?:ts|mjs)$|^packages/testing/)`
    },
    to: {
      path: String.raw`^(?:@rvu/testing|packages/testing)(?:/|$)|(^|/)node_modules/@rvu/testing(?:/|$)`
    }
  });

  forbidden.push({
    name: 'test-tooling-only-from-tests',
    comment:
      'Only test files may import test tooling (vitest, fast-check, testcontainers, @testcontainers/*). packages/testing itself is the provider.',
    severity: 'error',
    from: {
      path: '^(?:apps|modules|packages)/',
      pathNot: String.raw`(?:\.(?:int\.)?test\.(?:ts|mjs)$|^packages/testing/)`
    },
    to: {
      path: String.raw`^(?:vitest|fast-check|testcontainers|@testcontainers/[^/]+)$|(^|/)node_modules/(?:@testcontainers/|(?:vitest|fast-check|testcontainers)(?:/|$))`
    }
  });

  forbidden.push({
    name: 'no-circular',
    comment: 'Circular dependencies are not allowed.',
    severity: 'error',
    from: {},
    to: { circular: true }
  });

  const excludePath = String.raw`^(?!.*(?:^|/)node_modules/(?:@testcontainers/|(?:vitest|fast-check|testcontainers)(?:/|$)|\.pnpm-stub)).*(?:^|/)(?:dist|coverage|\.turbo)/`;

  return {
    forbidden,
    options: {
      doNotFollow: { path: '(^|/)node_modules/' },
      exclude: { path: excludePath }
    }
  };
}

module.exports = buildConfig(process.cwd());
