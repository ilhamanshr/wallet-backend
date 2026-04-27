import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsPositive, IsString, MaxLength } from 'class-validator';

export class TransferDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  to_username!: string;

  // See topup.dto.ts — `maxDecimalPlaces` is unsafe on values rendered
  // in scientific notation. Precision is bounded by the service.
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @IsPositive()
  amount!: number;
}
