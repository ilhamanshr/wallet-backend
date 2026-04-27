import { Injectable } from '@nestjs/common';

import { TopTransactionDto } from './dto/top-transactions.dto';
import { TopUserDto } from './dto/top-users.dto';
import { StatsRepository } from './stats.repository';

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

  /**
   * Top 10 users by aggregate outbound transfer value (debits).
   */
  topUsersByDebit(): Promise<TopUserDto[]> {
    return this.stats.topUsersByDebit();
  }
}
