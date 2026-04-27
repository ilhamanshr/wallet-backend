import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { Prisma, TransactionType } from '@prisma/client';

import { PrismaService } from 'src/prisma/prisma.service';

import { WalletsRepository } from './wallets.repository';
import { WalletsService } from './wallets.service';

interface FakeTx {
  wallet: {
    update: jest.Mock;
    findUnique: jest.Mock;
  };
  transaction: {
    create: jest.Mock;
  };
}

function makeFakeTx(): FakeTx {
  return {
    wallet: {
      update: jest.fn().mockResolvedValue(undefined),
      findUnique: jest.fn(),
    },
    transaction: {
      create: jest.fn().mockResolvedValue(undefined),
    },
  };
}

describe('WalletsService', () => {
  let walletsRepo: jest.Mocked<WalletsRepository>;
  let prisma: { $transaction: jest.Mock };
  let service: WalletsService;
  let tx: FakeTx;

  beforeEach(() => {
    tx = makeFakeTx();
    walletsRepo = {
      findByUserId: jest.fn(),
      lockByUserId: jest.fn(),
      lockPair: jest.fn(),
    } as unknown as jest.Mocked<WalletsRepository>;
    prisma = {
      $transaction: jest.fn().mockImplementation(async (cb: (t: FakeTx) => unknown) => cb(tx)),
    };
    service = new WalletsService(walletsRepo, prisma as unknown as PrismaService);
  });

  describe('readBalance', () => {
    it('returns the user wallet balance', async () => {
      walletsRepo.findByUserId.mockResolvedValue({
        id: 'w1',
        userId: 'u1',
        balance: new Prisma.Decimal('1000.5'),
        updatedAt: new Date(),
      });

      const result = await service.readBalance('u1');

      expect(walletsRepo.findByUserId).toHaveBeenCalledWith('u1');
      expect(result.balance.toString()).toBe('1000.5');
    });

    it('throws when wallet is missing (invariant violation)', async () => {
      walletsRepo.findByUserId.mockResolvedValue(null);

      await expect(service.readBalance('u1')).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });
  });

  describe('topup', () => {
    it('locks wallet, increments balance, writes a DEPOSIT transaction', async () => {
      walletsRepo.lockByUserId.mockResolvedValue({
        id: 'w1',
        userId: 'u1',
        balance: new Prisma.Decimal('0'),
        updatedAt: new Date(),
      });

      await service.topup('u1', 250.5);

      expect(walletsRepo.lockByUserId).toHaveBeenCalledWith(tx, 'u1');
      expect(tx.wallet.update).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        data: { balance: { increment: expect.any(Prisma.Decimal) } },
      });
      const incrementArg = tx.wallet.update.mock.calls[0][0].data.balance.increment as Prisma.Decimal;
      expect(incrementArg.toString()).toBe('250.5');

      expect(tx.transaction.create).toHaveBeenCalledWith({
        data: {
          type: TransactionType.DEPOSIT,
          amount: expect.any(Prisma.Decimal),
          toUserId: 'u1',
        },
      });
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    });

    it('throws when the wallet cannot be locked (missing)', async () => {
      walletsRepo.lockByUserId.mockResolvedValue(null);

      await expect(service.topup('u1', 100)).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
      expect(tx.wallet.update).not.toHaveBeenCalled();
    });

    it('truncates amounts to 8 decimal places (BTC precision)', async () => {
      walletsRepo.lockByUserId.mockResolvedValue({
        id: 'w1',
        userId: 'u1',
        balance: new Prisma.Decimal('0'),
        updatedAt: new Date(),
      });

      // 19 significant digits — JSON.parse already rounds to ~16 by the
      // time it reaches the service, then we truncate to 8 dp.
      await service.topup('u1', 1000.932489234792347);

      const incrementArg = tx.wallet.update.mock.calls[0][0].data.balance.increment as Prisma.Decimal;
      expect(incrementArg.toString()).toBe('1000.93248923');
    });

    it('rejects sub-precision amounts that round down to zero', async () => {
      // 0.0000000001 (1e-10) truncates to 0 at 8 dp — would otherwise
      // write a useless DEPOSIT row with amount 0.
      await expect(service.topup('u1', 0.0000000001)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(walletsRepo.lockByUserId).not.toHaveBeenCalled();
    });

    it('rejects amounts >= 10_000_000 (strict upper bound)', async () => {
      await expect(service.topup('u1', 10_000_000)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.topup('u1', 10_000_001)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(walletsRepo.lockByUserId).not.toHaveBeenCalled();
    });
  });
});
