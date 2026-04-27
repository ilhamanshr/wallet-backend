import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { AuthenticatedUser, CurrentUser } from 'src/common/decorators/current-user.decorator';

import { TopupDto } from './dto/topup.dto';
import { BalanceResult, WalletsService } from './wallets.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class WalletsController {
  constructor(private readonly wallets: WalletsService) {}

  @Get('balance')
  readBalance(@CurrentUser() user: AuthenticatedUser): Promise<BalanceResult> {
    return this.wallets.readBalance(user.id);
  }

  @Post('topup')
  @HttpCode(HttpStatus.NO_CONTENT)
  async topup(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: TopupDto,
  ): Promise<void> {
    await this.wallets.topup(user.id, body.amount);
  }
}
