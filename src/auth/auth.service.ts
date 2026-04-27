import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export interface JwtPayload {
  sub: string;
  username: string;
}

@Injectable()
export class AuthService {
  constructor(private readonly jwt: JwtService) {}

  async signToken(userId: string, username: string): Promise<string> {
    const payload: JwtPayload = { sub: userId, username };
    return this.jwt.signAsync(payload);
  }
}
