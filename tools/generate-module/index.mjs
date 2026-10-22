import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const generatorDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(generatorDir, '../..');
const templatesDir = path.join(generatorDir, 'templates');

const moduleNamePattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

function pascalCase(name) {
  return name
    .split('-')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join('');
}

function renderTemplate(template, name) {
  return template
    .replaceAll('__NAME__', name)
    .replaceAll('__PASCAL__', pascalCase(name));
}

function copyTemplates(sourceDir, destinationDir, name) {
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const destinationName = entry.name.replace(/\.tpl$/, '');
    const destinationPath = path.join(destinationDir, destinationName);

    if (entry.isDirectory()) {
      fs.mkdirSync(destinationPath, { recursive: true });
      copyTemplates(sourcePath, destinationPath, name);
      continue;
    }

    const contents = fs.readFileSync(sourcePath, 'utf8');
    fs.writeFileSync(destinationPath, renderTemplate(contents, name), 'utf8');
  }
}

export function generateModule(name, { rootDir = repoRoot } = {}) {
  if (!moduleNamePattern.test(name)) {
    throw new Error(
      `Invalid module name "${name}". Use lowercase kebab-case, for example "billing" or "provider-directory".`
    );
  }

  const modulesDir = path.join(rootDir, 'modules');
  const moduleDir = path.join(modulesDir, name);

  if (fs.existsSync(moduleDir)) {
    throw new Error(`Module already exists: ${path.relative(rootDir, moduleDir)}`);
  }

  fs.mkdirSync(moduleDir, { recursive: true });
  copyTemplates(templatesDir, moduleDir, name);

  return moduleDir;
}

function isMainModule() {
  if (!process.argv[1]) {
    return false;
  }

  return pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
}

if (isMainModule()) {
  const name = process.argv[2];

  if (!name) {
    console.error('Usage: pnpm gen:module <name>');
    process.exit(1);
  }

  try {
    const moduleDir = generateModule(name);
    console.log(`Generated ${path.relative(repoRoot, moduleDir)}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
