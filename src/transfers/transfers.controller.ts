import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { AuthenticatedUser, CurrentUser } from 'src/common/decorators/current-user.decorator';

import { TransferDto } from './dto/transfer.dto';
import { TransfersService } from './transfers.service';

@ApiTags('wallet')
@ApiBearerAuth('token')
@Controller('transfer')
@UseGuards(JwtAuthGuard)
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Transfer between wallets', description: 'Debits caller and credits the recipient. Balance never goes below 0.' })
  @ApiResponse({ status: 204, description: 'Transfer successful' })
  @ApiResponse({ status: 400, description: 'Insufficient balance or invalid amount' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Destination user not found' })
  async transfer(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: TransferDto,
  ): Promise<void> {
    await this.transfers.transfer(user.id, body.to_username, body.amount);
  }
}
