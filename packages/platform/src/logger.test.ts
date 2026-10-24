import { Writable } from 'node:stream';
import { expect, it } from 'vitest';
import { createLogger } from './logger';
import { runWithContext } from './execution-context';

it('redacts nested credentials and drops bodies, query strings and event payloads', () => {
  let output = '';
  const stream = new Writable({ write(chunk, _encoding, callback) { output += chunk.toString(); callback(); } });
  const logger = createLogger({ logLevel: 'info' }, stream);
  runWithContext({ correlationId: 'correlation' }, () => logger.info({
    headers: { authorization: 'secret', cookie: 'cookie' }, nested: { password: 'password', token: 'token' },
    body: 'body-secret', payload: 'event-secret', query: 'query-secret'
  }, 'request'));
  expect(output).toContain('correlation');
  for (const secret of ['secret', 'cookie"', 'password"', 'token"', 'body-secret', 'event-secret', 'query-secret']) {
    // Credential keys may remain; values must never remain.
    expect(output).not.toContain(`:"${secret}`);
  }
  expect(output).not.toContain('body-secret');
  expect(output).not.toContain('event-secret');
});
