import { Module } from '@nestjs/common';

import { AuthModule } from 'src/auth/auth.module';

import { WalletsController } from './wallets.controller';
import { WalletsRepository } from './wallets.repository';
import { WalletsService } from './wallets.service';

@Module({
  imports: [AuthModule],
  controllers: [WalletsController],
  providers: [WalletsService, WalletsRepository],
  exports: [WalletsRepository, WalletsService],
})
export class WalletsModule {}
