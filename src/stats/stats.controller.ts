import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { AuthenticatedUser, CurrentUser } from 'src/common/decorators/current-user.decorator';

import { TopTransactionDto } from './dto/top-transactions.dto';
import { TopUserDto } from './dto/top-users.dto';
import { StatsService } from './stats.service';

@ApiTags('stats')
@ApiBearerAuth('token')
@Controller()
@UseGuards(JwtAuthGuard)
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get('top_transactions_per_user')
  @ApiOperation({ summary: 'Top 10 transactions for current user', description: 'Returns transfers sorted by absolute value desc. Debits are negative, credits are positive.' })
  @ApiResponse({ status: 200, description: 'List of transactions', schema: { example: [{ username: 'bob', amount: 250 }, { username: 'carol', amount: -100 }] } })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  topTransactions(@CurrentUser() user: AuthenticatedUser): Promise<TopTransactionDto[]> {
    return this.stats.topTransactionsForUser(user.id);
  }

  @Get('top_users')
  @ApiOperation({ summary: 'Top 10 users by outbound transfer value', description: 'Aggregate of all outbound (debit) transfers per user, descending.' })
  @ApiResponse({ status: 200, description: 'List of top users', schema: { example: [{ username: 'alice', transacted_value: 1500 }, { username: 'bob', transacted_value: 800 }] } })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  topUsers(): Promise<TopUserDto[]> {
    return this.stats.topUsersByDebit();
  }
}
