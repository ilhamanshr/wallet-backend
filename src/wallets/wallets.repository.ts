import { Injectable } from '@nestjs/common';
import { Wallet } from '@prisma/client';

import { PrismaService } from 'src/prisma/prisma.service';

/**
 * Thin Prisma wrapper for the Wallet aggregate.
 *
 * Reads only at this stage — write paths arrive with topup and
 * transfers in subsequent commits.
 */
@Injectable()
export class WalletsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByUserId(userId: string): Promise<Wallet | null> {
    return this.prisma.wallet.findUnique({ where: { userId } });
  }
}
