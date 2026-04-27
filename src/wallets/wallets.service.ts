import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { WalletsRepository } from './wallets.repository';

export interface BalanceResult {
  balance: Prisma.Decimal;
}

@Injectable()
export class WalletsService {
  private readonly logger = new Logger(WalletsService.name);

  constructor(private readonly wallets: WalletsRepository) {}

  async readBalance(userId: string): Promise<BalanceResult> {
    const wallet = await this.wallets.findByUserId(userId);
    if (!wallet) {
      // Should never happen — wallet is created at registration time.
      this.logger.error(`Missing wallet for user ${userId}`);
      throw new InternalServerErrorException();
    }
    return { balance: wallet.balance };
  }
}
