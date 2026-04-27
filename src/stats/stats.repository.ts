import { Injectable } from '@nestjs/common';
import { Transaction, TransactionType } from '@prisma/client';

import { PrismaService } from 'src/prisma/prisma.service';

const TOP_LIMIT = 10;

export type TopTransactionRow = Transaction & {
  fromUser: { username: string } | null;
  toUser: { username: string };
};

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
}
