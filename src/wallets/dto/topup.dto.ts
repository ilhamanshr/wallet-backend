import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsPositive } from 'class-validator';

/**
 * The spec mandates: only positive topup amounts and values < 10_000_000.
 * The strict upper bound is enforced in the service using Decimal so we
 * don't lose precision near the boundary (JS Number rounds 9_999_999.999…
 * up to 10_000_000).
 */
export class TopupDto {
  // `maxDecimalPlaces` is intentionally omitted — class-validator
  // computes it from `String(value)`, which produces scientific notation
  // (e.g. "1e-10") for very small numbers and crashes on the missing
  // decimal point. Precision is bounded by the service-level
  // truncation to 8 dp and the DB column type Decimal(38, 18).
  @ApiProperty({ example: 1000, description: 'Amount to deposit. Must be > 0 and < 10 000 000.' })
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @IsPositive()
  amount!: number;
}
