import { Writable } from 'node:stream';
import { expect, it } from 'vitest';
import { createLogger } from './logger';

it('redacts credential values and omits request bodies and query strings in serialized JSON', () => {
  let output = '';
  const stream = new Writable({ write(chunk, _encoding, done) { output += chunk.toString(); done(); } });
  const secrets = {
    authorization: 'AUTH_SENTINEL', cookie: 'COOKIE_SENTINEL', password: 'PASSWORD_SENTINEL', token: 'TOKEN_SENTINEL',
    body: 'BODY_SENTINEL', query: 'QUERY_SENTINEL', queryString: 'QUERYSTRING_SENTINEL',
    originalUrl: '/route?secret=URL_SENTINEL'
  };
  createLogger({ logLevel: 'info' }, stream).info({
    req: { headers: { authorization: secrets.authorization, cookie: secrets.cookie },
      body: { value: secrets.body }, query: { value: secrets.query },
      queryString: secrets.queryString, originalUrl: secrets.originalUrl },
    nested: { password: secrets.password, entries: [{ token: secrets.token }] },
    route: '/route', status: 200
  }, 'request complete');
  const record = JSON.parse(output);
  expect(record.req).toEqual({ headers: { authorization: '[Redacted]', cookie: '[Redacted]' } });
  expect(record.nested).toEqual({ password: '[Redacted]', entries: [{ token: '[Redacted]' }] });
  expect(record).toMatchObject({ route: '/route', status: 200, msg: 'request complete' });
  for (const secret of Object.values(secrets)) expect(output).not.toContain(secret);
});
