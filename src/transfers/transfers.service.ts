import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TransactionType } from '@prisma/client';

import { PrismaService } from 'src/prisma/prisma.service';
import { UsersRepository } from 'src/users/users.repository';
import { WalletsRepository } from 'src/wallets/wallets.repository';

const WALLET_PRECISION = 8;

@Injectable()
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersRepository,
    private readonly wallets: WalletsRepository,
  ) {}

  /**
   * Transfers `amount` from the caller to the user identified by
   * `toUsername`. Atomicity & no-double-spend guarantees:
   *
   *   1. Resolve recipient outside the tx — fail fast on 404.
   *   2. Open a Serializable interactive transaction.
   *   3. Lock both wallet rows in deterministic order (sorted userIds).
   *      This eliminates deadlocks for concurrent A→B and B→A transfers.
   *   4. Re-read the locked sender wallet and validate the balance.
   *   5. Decrement sender, increment recipient, write a TRANSFER row.
   */
  async transfer(fromUserId: string, toUsername: string, amount: number): Promise<void> {
    const recipient = await this.users.findByUsername(toUsername);
    if (!recipient) {
      throw new NotFoundException('Destination user not found');
    }
    if (recipient.id === fromUserId) {
      throw new BadRequestException('Cannot transfer to self');
    }

    // Truncate to wallet precision so storage is stable and tiny inputs
    // (rounded to zero) are rejected with 400 instead of writing a
    // no-op TRANSFER row.
    const delta = new Prisma.Decimal(amount).toDecimalPlaces(
      WALLET_PRECISION,
      Prisma.Decimal.ROUND_DOWN,
    );
    if (delta.lte(0)) {
      throw new BadRequestException('amount must be a positive number');
    }

    await this.prisma.$transaction(
      async (tx) => {
        const { a: fromWallet, b: toWallet } = await this.wallets.lockPair(
          tx,
          fromUserId,
          recipient.id,
        );
        if (!fromWallet || !toWallet) {
          throw new InternalServerErrorException('Wallet not found');
        }
        if (fromWallet.balance.lessThan(delta)) {
          throw new BadRequestException('Insufficient balance');
        }

        await tx.wallet.update({
          where: { userId: fromUserId },
          data: { balance: { decrement: delta } },
        });
        await tx.wallet.update({
          where: { userId: recipient.id },
          data: { balance: { increment: delta } },
        });
        await tx.transaction.create({
          data: {
            type: TransactionType.TRANSFER,
            amount: delta,
            fromUserId,
            toUserId: recipient.id,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
