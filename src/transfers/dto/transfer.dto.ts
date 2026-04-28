import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsPositive, IsString, MaxLength } from 'class-validator';

export class TransferDto {
  @ApiProperty({ example: 'bob', description: 'Username of the recipient.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  to_username!: string;

  // See topup.dto.ts — `maxDecimalPlaces` is unsafe on values rendered
  // in scientific notation. Precision is bounded by the service.
  @ApiProperty({ example: 100, description: 'Amount to transfer. Must be > 0.' })
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @IsPositive()
  amount!: number;
}
