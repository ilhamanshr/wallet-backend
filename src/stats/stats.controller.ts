import { Controller, Get, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { AuthenticatedUser, CurrentUser } from 'src/common/decorators/current-user.decorator';

import { StatsService, TopTransactionDto } from './stats.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get('top_transactions_per_user')
  topTransactions(@CurrentUser() user: AuthenticatedUser): Promise<TopTransactionDto[]> {
    return this.stats.topTransactionsForUser(user.id);
  }
}
