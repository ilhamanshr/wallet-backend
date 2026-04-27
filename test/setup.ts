import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DecimalSerializerInterceptor } from '../src/common/interceptors/decimal-serializer.interceptor';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Boots the real Nest app against the TEST_DATABASE_URL (or DATABASE_URL)
 * Postgres. Cleans the wallet, transaction, and user tables between runs.
 */
export interface E2EHandle {
  app: INestApplication;
  prisma: PrismaService;
  reset: () => Promise<void>;
}

export async function bootE2E(modify?: (b: TestingModuleBuilder) => TestingModuleBuilder): Promise<E2EHandle> {
  if (process.env.TEST_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  }
  process.env.JWT_SECRET ??= 'test-secret-please-change';

  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (modify) builder = modify(builder);
  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new DecimalSerializerInterceptor());
  await app.init();

  const prisma = app.get(PrismaService);

  async function reset(): Promise<void> {
    await prisma.transaction.deleteMany();
    await prisma.wallet.deleteMany();
    await prisma.user.deleteMany();
  }

  return { app, prisma, reset };
}
