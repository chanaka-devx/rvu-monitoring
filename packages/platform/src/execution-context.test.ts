import { expect, it } from 'vitest';
import { currentContext, runWithContext } from './execution-context';

it('merges immutable nested contexts and restores the parent across async work', async () => {
  expect(currentContext()).toEqual({});
  await runWithContext({ correlationId: 'parent' }, async () => {
    expect(Object.isFrozen(currentContext())).toBe(true);
    await runWithContext({ actorId: 'child' }, async () => {
      await Promise.resolve();
      expect(currentContext()).toEqual({ correlationId: 'parent', actorId: 'child' });
    });
    expect(currentContext()).toEqual({ correlationId: 'parent' });
  });
  expect(currentContext()).toEqual({});
});

it('isolates concurrent async contexts', async () => {
  await Promise.all(['a', 'b'].map((actorId) => runWithContext({ actorId }, async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(currentContext().actorId).toBe(actorId);
  })));
});
