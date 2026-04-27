import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AuthService } from 'src/auth/auth.service';

import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let users: jest.Mocked<UsersRepository>;
  let auth: jest.Mocked<AuthService>;
  let service: UsersService;

  beforeEach(() => {
    users = {
      findByUsername: jest.fn(),
      findById: jest.fn(),
      createWithWallet: jest.fn(),
    } as unknown as jest.Mocked<UsersRepository>;
    auth = {
      signToken: jest.fn(),
    } as unknown as jest.Mocked<AuthService>;
    service = new UsersService(users, auth);
  });

  it('registers a new user, bootstraps wallet, returns a signed token', async () => {
    users.createWithWallet.mockResolvedValue({
      id: 'u1',
      username: 'alice',
      createdAt: new Date(),
    });
    auth.signToken.mockResolvedValue('jwt-token');

    const result = await service.register('alice');

    expect(users.createWithWallet).toHaveBeenCalledWith('alice');
    expect(auth.signToken).toHaveBeenCalledWith('u1', 'alice');
    expect(result).toEqual({ token: 'jwt-token' });
  });

  it('throws ConflictException when the username already exists (Prisma P2002)', async () => {
    users.createWithWallet.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(service.register('alice')).rejects.toBeInstanceOf(ConflictException);
    expect(auth.signToken).not.toHaveBeenCalled();
  });

  it('rethrows unexpected errors as-is', async () => {
    const boom = new Error('db down');
    users.createWithWallet.mockRejectedValue(boom);

    await expect(service.register('alice')).rejects.toBe(boom);
  });
});
