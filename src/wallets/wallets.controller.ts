import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { AuthenticatedUser, CurrentUser } from 'src/common/decorators/current-user.decorator';

import { TopupDto } from './dto/topup.dto';
import { BalanceResult, WalletsService } from './wallets.service';

@ApiTags('wallet')
@ApiBearerAuth('token')
@Controller()
@UseGuards(JwtAuthGuard)
export class WalletsController {
  constructor(private readonly wallets: WalletsService) {}

  @Get('balance')
  @ApiOperation({ summary: 'Read wallet balance' })
  @ApiResponse({ status: 200, description: 'Current balance', schema: { example: { balance: 750 } } })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  readBalance(@CurrentUser() user: AuthenticatedUser): Promise<BalanceResult> {
    return this.wallets.readBalance(user.id);
  }

  @Post('topup')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Deposit into wallet', description: 'Amount must be > 0 and < 10 000 000.' })
  @ApiResponse({ status: 204, description: 'Topup successful' })
  @ApiResponse({ status: 400, description: 'Invalid topup amount' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async topup(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: TopupDto,
  ): Promise<void> {
    await this.wallets.topup(user.id, body.amount);
  }
}
