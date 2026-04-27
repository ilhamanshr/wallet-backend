import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AuthService } from 'src/auth/auth.service';

import { UsersRepository } from './users.repository';

export interface RegisterResult {
  token: string;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly users: UsersRepository,
    private readonly auth: AuthService,
  ) {}

  /**
   * Registers a new user, bootstraps their wallet, and signs an auth token.
   *
   * The unique-username guarantee is enforced by the database; we rely on
   * the P2002 error rather than a TOCTOU pre-check.
   */
  async register(username: string): Promise<RegisterResult> {
    try {
      const user = await this.users.createWithWallet(username);
      const token = await this.auth.signToken(user.id, user.username);
      return { token };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Username already exists');
      }
      throw err;
    }
  }
}
