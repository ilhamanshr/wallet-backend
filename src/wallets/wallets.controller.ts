import { Controller, Get, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { AuthenticatedUser, CurrentUser } from 'src/common/decorators/current-user.decorator';

import { BalanceResult, WalletsService } from './wallets.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class WalletsController {
  constructor(private readonly wallets: WalletsService) {}

  @Get('balance')
  readBalance(@CurrentUser() user: AuthenticatedUser): Promise<BalanceResult> {
    return this.wallets.readBalance(user.id);
  }
}
