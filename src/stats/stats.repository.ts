import { Injectable } from '@nestjs/common';
import { Prisma, Transaction, TransactionType } from '@prisma/client';

import { PrismaService } from 'src/prisma/prisma.service';

const TOP_LIMIT = 10;

export type TopTransactionRow = Transaction & {
  fromUser: { username: string } | null;
  toUser: { username: string };
};

export interface TopUserRow {
  username: string;
  transacted_value: Prisma.Decimal;
}

@Injectable()
export class StatsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Top 10 TRANSFER rows touching `userId` (as sender or recipient),
   * ordered by absolute value desc. Both directions live on the same
   * column (`amount` is always positive) so a single ORDER BY suffices.
   */
  topTransactionsForUser(userId: string): Promise<TopTransactionRow[]> {
    return this.prisma.transaction.findMany({
      where: {
        type: TransactionType.TRANSFER,
        OR: [{ fromUserId: userId }, { toUserId: userId }],
      },
      orderBy: { amount: 'desc' },
      take: TOP_LIMIT,
      include: {
        fromUser: { select: { username: true } },
        toUser: { select: { username: true } },
      },
    });
  }

  /**
   * Top 10 users by total OUTBOUND transfer value (debits).
   *
   * LEFT JOIN so users with zero debits still appear when the system has
   * fewer than 10 active senders — matches the spec example showing a
   * user with `transacted_value: 0`.
   */
  topUsersByDebit(): Promise<TopUserRow[]> {
    return this.prisma.$queryRaw<TopUserRow[]>(Prisma.sql`
      SELECT u.username,
             COALESCE(SUM(t.amount), 0)::numeric AS transacted_value
      FROM "users" u
      LEFT JOIN "transactions" t
        ON t."fromUserId" = u.id
       AND t.type = 'TRANSFER'
      GROUP BY u.id, u.username
      ORDER BY transacted_value DESC, u.username ASC
      LIMIT ${TOP_LIMIT}
    `);
  }
}
