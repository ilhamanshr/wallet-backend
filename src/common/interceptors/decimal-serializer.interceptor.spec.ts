import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { firstValueFrom, of } from 'rxjs';

import { DecimalSerializerInterceptor } from './decimal-serializer.interceptor';

const fakeCtx = {} as ExecutionContext;

function run(payload: unknown): Promise<unknown> {
  const interceptor = new DecimalSerializerInterceptor();
  const handler: CallHandler = { handle: () => of(payload) };
  return firstValueFrom(interceptor.intercept(fakeCtx, handler));
}

describe('DecimalSerializerInterceptor', () => {
  it('converts a top-level Decimal to a JS number', async () => {
    const out = await run(new Prisma.Decimal('1234.5678'));
    expect(out).toBe(1234.5678);
  });

  it('converts Decimal fields inside an object', async () => {
    const out = await run({ balance: new Prisma.Decimal('1000.5'), unrelated: 'kept' });
    expect(out).toEqual({ balance: 1000.5, unrelated: 'kept' });
  });

  it('converts Decimal values inside an array of objects', async () => {
    const out = await run([
      { username: 'a', amount: new Prisma.Decimal('250') },
      { username: 'b', amount: new Prisma.Decimal('-100') },
    ]);
    expect(out).toEqual([
      { username: 'a', amount: 250 },
      { username: 'b', amount: -100 },
    ]);
  });

  it('walks nested objects and arrays', async () => {
    const out = await run({
      page: 1,
      rows: [
        { id: 'x', value: new Prisma.Decimal('0.1') },
        { id: 'y', meta: { score: new Prisma.Decimal('99.99') } },
      ],
    });
    expect(out).toEqual({
      page: 1,
      rows: [
        { id: 'x', value: 0.1 },
        { id: 'y', meta: { score: 99.99 } },
      ],
    });
  });

  it('preserves null and undefined values', async () => {
    const out = await run({ a: null, b: undefined, c: new Prisma.Decimal('5') });
    expect(out).toEqual({ a: null, b: undefined, c: 5 });
  });

  it('passes through primitives unchanged', async () => {
    expect(await run('hello')).toBe('hello');
    expect(await run(42)).toBe(42);
    expect(await run(true)).toBe(true);
    expect(await run(null)).toBeNull();
  });
});
