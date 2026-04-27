import { Prisma, TransactionType } from '@prisma/client';

import { StatsRepository, TopTransactionRow } from './stats.repository';
import { StatsService } from './stats.service';

const ME = 'me';

interface RowInput {
  id?: string;
  amount: string;
  fromUserId: string | null;
  toUserId?: string;
  fromUser?: { username: string } | null;
  toUser?: { username: string };
}

function row(input: RowInput): TopTransactionRow {
  return {
    id: input.id ?? 'tx',
    type: TransactionType.TRANSFER,
    amount: new Prisma.Decimal(input.amount),
    fromUserId: input.fromUserId,
    toUserId: input.toUserId ?? ME,
    createdAt: new Date(),
    fromUser: input.fromUser ?? (input.fromUserId ? { username: 'alice' } : null),
    toUser: input.toUser ?? { username: 'bob' },
  };
}

describe('StatsService', () => {
  let repo: jest.Mocked<StatsRepository>;
  let service: StatsService;

  beforeEach(() => {
    repo = {
      topTransactionsForUser: jest.fn(),
      topUsersByDebit: jest.fn(),
    } as unknown as jest.Mocked<StatsRepository>;
    service = new StatsService(repo);
  });

  describe('topTransactionsForUser', () => {
    it('flips sign on debits, keeps credits positive, picks counterparty username', async () => {
      repo.topTransactionsForUser.mockResolvedValue([
        row({
          // Outbound from me to bob
          fromUserId: ME,
          toUserId: 'u-bob',
          amount: '500',
          fromUser: { username: 'me' },
          toUser: { username: 'bob' },
        }),
        row({
          // Inbound from alice to me
          fromUserId: 'u-alice',
          toUserId: ME,
          amount: '200',
          fromUser: { username: 'alice' },
          toUser: { username: 'me' },
        }),
      ]);

      const result = await service.topTransactionsForUser(ME);

      expect(result).toEqual([
        { username: 'bob', amount: expect.any(Prisma.Decimal) },
        { username: 'alice', amount: expect.any(Prisma.Decimal) },
      ]);
      expect((result[0].amount as Prisma.Decimal).toString()).toBe('-500');
      expect((result[1].amount as Prisma.Decimal).toString()).toBe('200');
    });

    it('returns empty array when there are no transactions', async () => {
      repo.topTransactionsForUser.mockResolvedValue([]);
      await expect(service.topTransactionsForUser(ME)).resolves.toEqual([]);
    });

    it('preserves repository ordering (caller is authoritative)', async () => {
      repo.topTransactionsForUser.mockResolvedValue([
        row({ fromUserId: 'u-x', toUserId: ME, amount: '100', fromUser: { username: 'x' } }),
        row({ fromUserId: ME, toUserId: 'u-y', amount: '80', toUser: { username: 'y' } }),
      ]);

      const result = await service.topTransactionsForUser(ME);

      expect(result.map((r) => r.username)).toEqual(['x', 'y']);
    });
  });

  describe('topUsersByDebit', () => {
    // The service is a pass-through; the interesting LEFT JOIN / SUM /
    // ORDER BY / LIMIT logic lives in the repository SQL and is
    // exercised by the e2e suite against a real Postgres.

    it('passes through repository results', async () => {
      repo.topUsersByDebit.mockResolvedValue([
        { username: 'a', transacted_value: new Prisma.Decimal('1000') },
        { username: 'b', transacted_value: new Prisma.Decimal('0') },
      ]);

      const result = await service.topUsersByDebit();

      expect(result).toHaveLength(2);
      expect(result[0].username).toBe('a');
      expect(result[1].transacted_value.toString()).toBe('0');
    });

    it('returns an empty array when the repository has no rows', async () => {
      repo.topUsersByDebit.mockResolvedValue([]);

      await expect(service.topUsersByDebit()).resolves.toEqual([]);
    });

    it('preserves repository ordering — service does not re-sort', async () => {
      repo.topUsersByDebit.mockResolvedValue([
        { username: 'zebra', transacted_value: new Prisma.Decimal('900') },
        { username: 'apple', transacted_value: new Prisma.Decimal('500') },
        { username: 'mango', transacted_value: new Prisma.Decimal('100') },
      ]);

      const result = await service.topUsersByDebit();

      expect(result.map((r) => r.username)).toEqual(['zebra', 'apple', 'mango']);
    });
  });
});
