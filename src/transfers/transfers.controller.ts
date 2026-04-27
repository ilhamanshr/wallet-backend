import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { AuthenticatedUser, CurrentUser } from 'src/common/decorators/current-user.decorator';

import { TransferDto } from './dto/transfer.dto';
import { TransfersService } from './transfers.service';

@Controller('transfer')
@UseGuards(JwtAuthGuard)
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  async transfer(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: TransferDto,
  ): Promise<void> {
    await this.transfers.transfer(user.id, body.to_username, body.amount);
  }
}
