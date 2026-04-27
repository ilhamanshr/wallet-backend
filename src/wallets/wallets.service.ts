import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Prisma, TransactionType } from '@prisma/client';

import { PrismaService } from 'src/prisma/prisma.service';

import { WalletsRepository } from './wallets.repository';

const TOPUP_MAX = new Prisma.Decimal(10_000_000);

/**
 * Wallet precision (decimal places). Aligned with the BTC convention
 * (8 dp). Inputs are truncated to this precision on write so balances
 * stored in the DB always have a predictable shape and JSON-parse drift
 * past 15 significant digits is normalised away.
 */
const WALLET_PRECISION = 8;

export interface BalanceResult {
  balance: Prisma.Decimal;
}

@Injectable()
export class WalletsService {
  private readonly logger = new Logger(WalletsService.name);

  constructor(
    private readonly wallets: WalletsRepository,
    private readonly prisma: PrismaService,
  ) {}

  async readBalance(userId: string): Promise<BalanceResult> {
    const wallet = await this.wallets.findByUserId(userId);
    if (!wallet) {
      // Should never happen — wallet is created at registration time.
      this.logger.error(`Missing wallet for user ${userId}`);
      throw new InternalServerErrorException();
    }
    return { balance: wallet.balance };
  }

  /**
   * Topup is safe under concurrency:
   *   1. Open a Serializable transaction.
   *   2. Lock the wallet row (SELECT ... FOR UPDATE).
   *   3. Increment balance and write a DEPOSIT transaction row.
   *
   * The strict `< 10_000_000` upper bound is enforced here using Decimal
   * to avoid the float-rounding hole at the boundary (a class-validator
   * `@Max` would silently allow exactly 10_000_000 because of JS Number
   * precision near the limit).
   */
  async topup(userId: string, amount: number): Promise<void> {
    const delta = new Prisma.Decimal(amount).toDecimalPlaces(
      WALLET_PRECISION,
      Prisma.Decimal.ROUND_DOWN,
    );
    if (delta.lte(0)) {
      throw new BadRequestException('amount must be a positive number');
    }
    if (delta.gte(TOPUP_MAX)) {
      throw new BadRequestException('amount must be less than 10000000');
    }

    await this.prisma.$transaction(
      async (tx) => {
        const wallet = await this.wallets.lockByUserId(tx, userId);
        if (!wallet) {
          throw new InternalServerErrorException('Wallet not found');
        }

        await tx.wallet.update({
          where: { userId },
          data: { balance: { increment: delta } },
        });

        await tx.transaction.create({
          data: {
            type: TransactionType.DEPOSIT,
            amount: delta,
            toUserId: userId,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
