import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { AuthenticatedUser } from 'src/common/decorators/current-user.decorator';
import { PrismaService } from 'src/prisma/prisma.service';

import { JwtPayload } from './auth.service';

/**
 * The OpenAPI spec passes the raw token in the `Authorization` header
 * (no Bearer prefix). We accept both shapes for robustness:
 *   Authorization: <token>
 *   Authorization: Bearer <token>
 */
function extractToken(req: Request): string | null {
  const header = req.headers['authorization'];
  if (!header || typeof header !== 'string') return null;
  const trimmed = header.trim();
  if (!trimmed) return null;
  const [scheme, ...rest] = trimmed.split(' ');
  if (rest.length > 0 && /^bearer$/i.test(scheme)) {
    return rest.join(' ').trim() || null;
  }
  // Raw token — return the entire header value.
  return trimmed;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([extractToken]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('jwtSecret'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (!payload?.sub) {
      throw new UnauthorizedException();
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      throw new UnauthorizedException();
    }
    return { id: user.id, username: user.username };
  }
}
