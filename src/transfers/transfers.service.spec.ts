import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma, TransactionType } from '@prisma/client';

import { PrismaService } from 'src/prisma/prisma.service';
import { UsersRepository } from 'src/users/users.repository';
import { WalletsRepository } from 'src/wallets/wallets.repository';

import { TransfersService } from './transfers.service';

interface FakeTx {
  wallet: { update: jest.Mock };
  transaction: { create: jest.Mock };
}

function fakeTx(): FakeTx {
  return {
    wallet: { update: jest.fn().mockResolvedValue(undefined) },
    transaction: { create: jest.fn().mockResolvedValue(undefined) },
  };
}

const ALICE = { id: 'u-alice', username: 'alice', createdAt: new Date() };
const BOB = { id: 'u-bob', username: 'bob', createdAt: new Date() };

describe('TransfersService', () => {
  let users: jest.Mocked<UsersRepository>;
  let wallets: jest.Mocked<WalletsRepository>;
  let prisma: { $transaction: jest.Mock };
  let tx: FakeTx;
  let service: TransfersService;

  beforeEach(() => {
    tx = fakeTx();
    users = {
      findByUsername: jest.fn(),
      findById: jest.fn(),
      createWithWallet: jest.fn(),
    } as unknown as jest.Mocked<UsersRepository>;
    wallets = {
      findByUserId: jest.fn(),
      lockByUserId: jest.fn(),
      lockPair: jest.fn(),
    } as unknown as jest.Mocked<WalletsRepository>;
    prisma = {
      $transaction: jest.fn().mockImplementation(async (cb: (t: FakeTx) => unknown) => cb(tx)),
    };
    service = new TransfersService(
      prisma as unknown as PrismaService,
      users,
      wallets,
    );
  });

  it('debits sender, credits recipient, writes a TRANSFER row', async () => {
    users.findByUsername.mockResolvedValue(BOB);
    wallets.lockPair.mockResolvedValue({
      a: { id: 'wA', userId: ALICE.id, balance: new Prisma.Decimal('500'), updatedAt: new Date() },
      b: { id: 'wB', userId: BOB.id, balance: new Prisma.Decimal('0'), updatedAt: new Date() },
    });

    await service.transfer(ALICE.id, 'bob', 100);

    expect(wallets.lockPair).toHaveBeenCalledWith(tx, ALICE.id, BOB.id);
    expect(tx.wallet.update).toHaveBeenCalledWith({
      where: { userId: ALICE.id },
      data: { balance: { decrement: expect.any(Prisma.Decimal) } },
    });
    expect(tx.wallet.update).toHaveBeenCalledWith({
      where: { userId: BOB.id },
      data: { balance: { increment: expect.any(Prisma.Decimal) } },
    });
    expect(tx.transaction.create).toHaveBeenCalledWith({
      data: {
        type: TransactionType.TRANSFER,
        amount: expect.any(Prisma.Decimal),
        fromUserId: ALICE.id,
        toUserId: BOB.id,
      },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('returns 404 when the destination user is missing', async () => {
    users.findByUsername.mockResolvedValue(null);

    await expect(service.transfer(ALICE.id, 'ghost', 50)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects self-transfer with 400', async () => {
    users.findByUsername.mockResolvedValue(ALICE);

    await expect(service.transfer(ALICE.id, 'alice', 50)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects with 400 when the sender has insufficient balance', async () => {
    users.findByUsername.mockResolvedValue(BOB);
    wallets.lockPair.mockResolvedValue({
      a: { id: 'wA', userId: ALICE.id, balance: new Prisma.Decimal('10'), updatedAt: new Date() },
      b: { id: 'wB', userId: BOB.id, balance: new Prisma.Decimal('0'), updatedAt: new Date() },
    });

    await expect(service.transfer(ALICE.id, 'bob', 100)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tx.wallet.update).not.toHaveBeenCalled();
    expect(tx.transaction.create).not.toHaveBeenCalled();
  });

  it('allows transferring the exact full balance (boundary check on >= vs >)', async () => {
    // Insufficient-balance check is `balance.lessThan(delta)` — a transfer
    // of *exactly* balance must succeed and leave the wallet at zero.
    users.findByUsername.mockResolvedValue(BOB);
    wallets.lockPair.mockResolvedValue({
      a: { id: 'wA', userId: ALICE.id, balance: new Prisma.Decimal('100'), updatedAt: new Date() },
      b: { id: 'wB', userId: BOB.id, balance: new Prisma.Decimal('0'), updatedAt: new Date() },
    });

    await expect(service.transfer(ALICE.id, 'bob', 100)).resolves.toBeUndefined();

    const decrement = tx.wallet.update.mock.calls[0][0].data.balance.decrement as Prisma.Decimal;
    expect(decrement.toString()).toBe('100');
    expect(tx.transaction.create).toHaveBeenCalled();
  });

  it('preserves decimal precision (no float drift)', async () => {
    users.findByUsername.mockResolvedValue(BOB);
    wallets.lockPair.mockResolvedValue({
      a: {
        id: 'wA',
        userId: ALICE.id,
        balance: new Prisma.Decimal('0.30000000000000001'),
        updatedAt: new Date(),
      },
      b: { id: 'wB', userId: BOB.id, balance: new Prisma.Decimal('0'), updatedAt: new Date() },
    });

    await service.transfer(ALICE.id, 'bob', 0.1);

    const decrement = tx.wallet.update.mock.calls[0][0].data.balance.decrement as Prisma.Decimal;
    expect(decrement.toString()).toBe('0.1');
  });

  it('truncates the transfer amount to 8 decimal places', async () => {
    users.findByUsername.mockResolvedValue(BOB);
    wallets.lockPair.mockResolvedValue({
      a: { id: 'wA', userId: ALICE.id, balance: new Prisma.Decimal('5000'), updatedAt: new Date() },
      b: { id: 'wB', userId: BOB.id, balance: new Prisma.Decimal('0'), updatedAt: new Date() },
    });

    await service.transfer(ALICE.id, 'bob', 1000.932489234792347);

    const decrement = tx.wallet.update.mock.calls[0][0].data.balance.decrement as Prisma.Decimal;
    expect(decrement.toString()).toBe('1000.93248923');
  });

  it('rejects sub-precision transfers that round down to zero', async () => {
    users.findByUsername.mockResolvedValue(BOB);

    await expect(service.transfer(ALICE.id, 'bob', 0.0000000001)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(wallets.lockPair).not.toHaveBeenCalled();
  });
});