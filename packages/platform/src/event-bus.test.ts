import { expect, it } from 'vitest';
import { EventBus } from './event-bus';

it('selects subscriptions by event type and rejects duplicate consumer registrations', () => {
  const bus = new EventBus();
  const handler = async () => {};
  bus.subscribe({ consumer: 'projection', eventType: 'created', handler });
  expect(bus.subscriptions('created')).toHaveLength(1);
  expect(bus.subscriptions('other')).toHaveLength(0);
  expect(() => bus.subscribe({ consumer: 'projection', eventType: 'created', handler })).toThrow(/duplicate/i);
});
