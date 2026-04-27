import { Injectable } from '@nestjs/common';
import { Prisma, Wallet } from '@prisma/client';

import { PrismaService } from 'src/prisma/prisma.service';

/**
 * Wallet repository. The "locked" methods MUST be called inside a Prisma
 * interactive transaction; they take a row-level lock on the wallet so
 * concurrent topups/transfers serialize cleanly.
 */
@Injectable()
export class WalletsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByUserId(userId: string): Promise<Wallet | null> {
    return this.prisma.wallet.findUnique({ where: { userId } });
  }

  /**
   * Acquires a row-level lock on the wallet for the duration of the tx and
   * returns its fresh state. Use only inside `prisma.$transaction`.
   */
  async lockByUserId(tx: Prisma.TransactionClient, userId: string): Promise<Wallet | null> {
    await tx.$queryRaw<unknown[]>(
      Prisma.sql`SELECT id FROM "wallets" WHERE "userId" = ${userId} FOR UPDATE`,
    );
    return tx.wallet.findUnique({ where: { userId } });
  }

  /**
   * Locks two wallets in deterministic order (by userId asc) to prevent
   * deadlocks under concurrent A-B / B-A transfers.
   */
  async lockPair(
    tx: Prisma.TransactionClient,
    userIdA: string,
    userIdB: string,
  ): Promise<{ a: Wallet | null; b: Wallet | null }> {
    const [first, second] = [userIdA, userIdB].sort();
    await tx.$queryRaw<unknown[]>(
      Prisma.sql`SELECT id FROM "wallets" WHERE "userId" IN (${first}, ${second}) ORDER BY "userId" FOR UPDATE`,
    );
    const [a, b] = await Promise.all([
      tx.wallet.findUnique({ where: { userId: userIdA } }),
      tx.wallet.findUnique({ where: { userId: userIdB } }),
    ]);
    return { a, b };
  }
}