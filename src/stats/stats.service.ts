import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { StatsRepository } from './stats.repository';

export interface TopTransactionDto {
  username: string;
  amount: Prisma.Decimal;
}

@Injectable()
export class StatsService {
  constructor(private readonly stats: StatsRepository) {}

  /**
   * Top 10 transfer transactions touching the user, sorted by absolute
   * value descending. Debits (outbound) are returned with a negative sign;
   * credits keep the positive value. The username on each row is the
   * counterparty.
   */
  async topTransactionsForUser(userId: string): Promise<TopTransactionDto[]> {
    const rows = await this.stats.topTransactionsForUser(userId);

    return rows.map((row) => {
      const isDebit = row.fromUserId === userId;
      const counterpartyUsername = isDebit
        ? row.toUser.username
        : (row.fromUser?.username ?? '');
      const signedAmount = isDebit ? row.amount.negated() : row.amount;
      return { username: counterpartyUsername, amount: signedAmount };
    });
  }
}
