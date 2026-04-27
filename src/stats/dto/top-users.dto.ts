import { Prisma } from '@prisma/client';

/**
 * One row of `GET /top_users`.
 *
 * `transacted_value` is the aggregate of OUTBOUND transfers (debits)
 * for the user. Field name matches the OpenAPI spec verbatim.
 */
export interface TopUserDto {
  username: string;
  transacted_value: Prisma.Decimal;
}
