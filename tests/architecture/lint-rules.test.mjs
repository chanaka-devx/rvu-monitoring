import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { ESLint } from 'eslint';
import { fixturesRoot, repoRoot } from './helpers.mjs';

const configFile = path.join(repoRoot, 'eslint.config.mjs');

async function lintFixture(name) {
  const cwd = path.join(fixturesRoot, name);
  const eslint = new ESLint({
    cwd,
    overrideConfigFile: configFile,
    ignore: false
  });
  const results = await eslint.lintFiles([path.join(cwd, 'modules')]);

  return results.flatMap((result) => result.messages);
}

function messagesContaining(messages, fragment) {
  return messages.filter((message) => message.message.includes(fragment));
}

describe('determinism lint rules', () => {
  it('rejects Date.now() in domain code and points to the Clock port', async () => {
    const messages = await lintFixture('lint-determinism-date-now');

    expect(messagesContaining(messages, 'Clock').length).toBeGreaterThan(0);
  });

  it('rejects zero-argument new Date() in domain code and points to the Clock port', async () => {
    const messages = await lintFixture('lint-determinism-new-date');

    expect(messagesContaining(messages, 'Clock').length).toBeGreaterThan(0);
  });

  it('rejects Math.random() in domain code and points to the IdGenerator port', async () => {
    const messages = await lintFixture('lint-determinism-math-random');

    expect(messagesContaining(messages, 'IdGenerator').length).toBeGreaterThan(0);
  });

  it('rejects parseFloat() in domain code and points to Decimal', async () => {
    const messages = await lintFixture('lint-determinism-parse-float');

    expect(messagesContaining(messages, 'Decimal').length).toBeGreaterThan(0);
  });

  it('rejects Number.parseFloat() in domain code and points to Decimal', async () => {
    const messages = await lintFixture('lint-determinism-number-parse-float');

    expect(messagesContaining(messages, 'Decimal').length).toBeGreaterThan(0);
  });

  it('rejects non-determinism in application code', async () => {
    const messages = await lintFixture('lint-determinism-application');

    expect(messagesContaining(messages, 'Clock').length).toBeGreaterThan(0);
  });

  it('allows domain and application code that uses injected ports', async () => {
    const messages = await lintFixture('lint-determinism-clean');

    expect(messages).toEqual([]);
  });

  it('does not apply determinism rules to test files', async () => {
    const messages = await lintFixture('lint-determinism-test-exempt');

    expect(messages).toEqual([]);
  });

  it('does not apply determinism rules outside domain and application', async () => {
    const messages = await lintFixture('lint-determinism-interface');

    expect(messages).toEqual([]);
  });
});
