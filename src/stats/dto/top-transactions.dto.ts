import { Prisma } from '@prisma/client';

/**
 * One row of `GET /top_transactions_per_user`.
 *
 * `username` is the counterparty (the *other* side of the transfer);
 * `amount` is signed — negative for outbound (debit), positive for
 * inbound (credit). The `DecimalSerializerInterceptor` converts the
 * Decimal to a JSON `number` at the response boundary.
 */
export interface TopTransactionDto {
  username: string;
  amount: Prisma.Decimal;
}
