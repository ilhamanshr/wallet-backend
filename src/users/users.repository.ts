import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';

import { PrismaService } from 'src/prisma/prisma.service';

/**
 * Thin Prisma wrapper for the User aggregate.
 *
 * Exposes a small, stable surface so the service layer can be unit-tested
 * with a mocked repository.
 */
@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByUsername(username: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { username } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /**
   * Creates the User and bootstraps a Wallet at balance 0 atomically.
   */
  async createWithWallet(username: string): Promise<User> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const user = await tx.user.create({ data: { username } });
      await tx.wallet.create({ data: { userId: user.id } });
      return user;
    });
  }
}
