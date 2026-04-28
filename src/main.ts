import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { DecimalSerializerInterceptor } from './common/interceptors/decimal-serializer.interceptor';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  // Disable ETags — Express generates them by default and returns 304 when
  // the response body hasn't changed. For a wallet API, clients must always
  // receive the current balance, not a cached copy.
  app.getHttpAdapter().getInstance().set('etag', false);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Insignia Crypto Wallet API')
    .setDescription(
      'Backend for the Insignia offline assignment: a simple crypto-wallet REST API.\n\n' +
        '**Auth**: Register via `POST /user` to receive a token. ' +
        'Click **Authorize** above and paste the token (without "Bearer ").',
    )
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'token')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new DecimalSerializerInterceptor());

  const config = app.get(ConfigService);
  const port = config.getOrThrow<number>('port');

  await app.listen(port);
  Logger.log(`Wallet API listening on :${port}`, 'Bootstrap');
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal bootstrap error', err);
  process.exit(1);
});
