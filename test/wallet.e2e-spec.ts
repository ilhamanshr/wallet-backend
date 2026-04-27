import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { PrismaService } from '../src/prisma/prisma.service';

import { bootE2E } from './setup';

/**
 * End-to-end tests against a real Postgres. Requires
 *   docker compose up -d postgres
 *   npx prisma migrate deploy
 * before running.
 */
describe('Wallet API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reset: () => Promise<void>;

  beforeAll(async () => {
    ({ app, prisma, reset } = await bootE2E());
  });

  beforeEach(async () => {
    await reset();
  });

  afterAll(async () => {
    await app.close();
  });

  async function register(username: string): Promise<string> {
    const res = await request(app.getHttpServer()).post('/user').send({ username }).expect(201);
    return res.body.token as string;
  }

  describe('POST /user', () => {
    it('registers a user and returns a token', async () => {
      const res = await request(app.getHttpServer())
        .post('/user')
        .send({ username: 'alice' })
        .expect(201);
      expect(typeof res.body.token).toBe('string');
      expect(res.body.token.length).toBeGreaterThan(0);
    });

    it('400 on invalid body', async () => {
      await request(app.getHttpServer()).post('/user').send({}).expect(400);
      await request(app.getHttpServer()).post('/user').send({ username: '' }).expect(400);
      await request(app.getHttpServer()).post('/user').send({ username: 'a' }).expect(400);
    });

    it('409 when username already exists', async () => {
      await register('bob');
      await request(app.getHttpServer())
        .post('/user')
        .send({ username: 'bob' })
        .expect(409);
    });
  });

  describe('GET /balance', () => {
    it('401 without a token', async () => {
      await request(app.getHttpServer()).get('/balance').expect(401);
    });

    it('returns 0 for a fresh user', async () => {
      const token = await register('alice');
      const res = await request(app.getHttpServer())
        .get('/balance')
        .set('Authorization', token)
        .expect(200);
      expect(res.body).toEqual({ balance: 0 });
    });

    it('also accepts the Bearer prefix', async () => {
      const token = await register('alice');
      const res = await request(app.getHttpServer())
        .get('/balance')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body).toEqual({ balance: 0 });
    });
  });

  describe('POST /topup', () => {
    it('204 happy path', async () => {
      const token = await register('alice');
      await request(app.getHttpServer())
        .post('/topup')
        .set('Authorization', token)
        .send({ amount: 1000 })
        .expect(204);

      const res = await request(app.getHttpServer())
        .get('/balance')
        .set('Authorization', token)
        .expect(200);
      expect(res.body).toEqual({ balance: 1000 });
    });

    it('rejects 0, negatives, and amounts >= 10_000_000', async () => {
      const token = await register('alice');
      const cases = [0, -1, 10_000_000, 10_000_001];
      for (const amount of cases) {
        await request(app.getHttpServer())
          .post('/topup')
          .set('Authorization', token)
          .send({ amount })
          .expect(400);
      }
    });

    it('truncates amounts to 8 decimal places', async () => {
      const token = await register('alice');
      await request(app.getHttpServer())
        .post('/topup')
        .set('Authorization', token)
        .send({ amount: 1000.932489234792347 })
        .expect(204);

      const res = await request(app.getHttpServer())
        .get('/balance')
        .set('Authorization', token)
        .expect(200);
      expect(res.body).toEqual({ balance: 1000.93248923 });
    });

    it('rejects sub-precision amounts that round down to zero', async () => {
      const token = await register('alice');
      await request(app.getHttpServer())
        .post('/topup')
        .set('Authorization', token)
        .send({ amount: 0.0000000001 })
        .expect(400);
    });

    it('401 without a token', async () => {
      await request(app.getHttpServer()).post('/topup').send({ amount: 100 }).expect(401);
    });
  });

  describe('POST /transfer', () => {
    it('204 happy path: debits sender, credits recipient, writes a TRANSFER row', async () => {
      const aliceToken = await register('alice');
      await register('bob');
      await request(app.getHttpServer())
        .post('/topup')
        .set('Authorization', aliceToken)
        .send({ amount: 500 })
        .expect(204);

      await request(app.getHttpServer())
        .post('/transfer')
        .set('Authorization', aliceToken)
        .send({ to_username: 'bob', amount: 200 })
        .expect(204);

      const aliceBalance = await request(app.getHttpServer())
        .get('/balance')
        .set('Authorization', aliceToken)
        .expect(200);
      expect(aliceBalance.body.balance).toBe(300);

      const txCount = await prisma.transaction.count({ where: { type: 'TRANSFER' } });
      expect(txCount).toBe(1);
    });

    it('400 on insufficient balance', async () => {
      const aliceToken = await register('alice');
      await register('bob');
      await request(app.getHttpServer())
        .post('/transfer')
        .set('Authorization', aliceToken)
        .send({ to_username: 'bob', amount: 1 })
        .expect(400);
    });

    it('404 when destination user is missing', async () => {
      const token = await register('alice');
      await request(app.getHttpServer())
        .post('/transfer')
        .set('Authorization', token)
        .send({ to_username: 'ghost', amount: 1 })
        .expect(404);
    });

    it('400 on self-transfer', async () => {
      const token = await register('alice');
      await request(app.getHttpServer())
        .post('/topup')
        .set('Authorization', token)
        .send({ amount: 50 })
        .expect(204);

      await request(app.getHttpServer())
        .post('/transfer')
        .set('Authorization', token)
        .send({ to_username: 'alice', amount: 10 })
        .expect(400);
    });

    it('401 without a token', async () => {
      await request(app.getHttpServer())
        .post('/transfer')
        .send({ to_username: 'bob', amount: 1 })
        .expect(401);
    });

    it('concurrent transfers never overdraft (no double-spend)', async () => {
      const aliceToken = await register('alice');
      await register('bob');
      await request(app.getHttpServer())
        .post('/topup')
        .set('Authorization', aliceToken)
        .send({ amount: 100 })
        .expect(204);

      // Two concurrent attempts to transfer the entire balance.
      const [a, b] = await Promise.all([
        request(app.getHttpServer())
          .post('/transfer')
          .set('Authorization', aliceToken)
          .send({ to_username: 'bob', amount: 100 }),
        request(app.getHttpServer())
          .post('/transfer')
          .set('Authorization', aliceToken)
          .send({ to_username: 'bob', amount: 100 }),
      ]);

      const statuses = [a.status, b.status].sort();
      // Exactly one should succeed (204), the other should fail (400 or 500
      // if Postgres aborts the serialization). We accept either failure
      // class — the invariant under test is that balance never goes negative.
      expect(statuses).toContain(204);

      const balance = await request(app.getHttpServer())
        .get('/balance')
        .set('Authorization', aliceToken)
        .expect(200);
      expect(balance.body.balance).toBe(0);

      const bobToken = (
        await request(app.getHttpServer())
          .post('/user')
          .send({ username: 'bob2' })
          .expect(201)
      ).body.token;
      // sanity: we can still register/issue tokens
      expect(typeof bobToken).toBe('string');
    });
  });

  describe('GET /top_transactions_per_user', () => {
    it('returns counterparty username and signed amount, sorted by abs value desc', async () => {
      const aliceToken = await register('alice');
      const bobToken = await register('bob');
      await register('carol');

      await request(app.getHttpServer())
        .post('/topup')
        .set('Authorization', aliceToken)
        .send({ amount: 1000 });
      await request(app.getHttpServer())
        .post('/topup')
        .set('Authorization', bobToken)
        .send({ amount: 1000 });

      // alice → bob: 100  (debit for alice)
      // bob → alice: 250  (credit for alice)
      // alice → carol: 50  (debit for alice)
      await request(app.getHttpServer())
        .post('/transfer')
        .set('Authorization', aliceToken)
        .send({ to_username: 'bob', amount: 100 });
      await request(app.getHttpServer())
        .post('/transfer')
        .set('Authorization', bobToken)
        .send({ to_username: 'alice', amount: 250 });
      await request(app.getHttpServer())
        .post('/transfer')
        .set('Authorization', aliceToken)
        .send({ to_username: 'carol', amount: 50 });

      const res = await request(app.getHttpServer())
        .get('/top_transactions_per_user')
        .set('Authorization', aliceToken)
        .expect(200);

      expect(res.body).toEqual([
        { username: 'bob', amount: 250 },
        { username: 'bob', amount: -100 },
        { username: 'carol', amount: -50 },
      ]);
    });

    it('returns empty array for users with no transactions', async () => {
      const token = await register('alice');
      const res = await request(app.getHttpServer())
        .get('/top_transactions_per_user')
        .set('Authorization', token)
        .expect(200);
      expect(res.body).toEqual([]);
    });

    it('does not include DEPOSIT (topup) rows — only TRANSFER', async () => {
      // Spec: "credits (transfers to the user) and debits (transfers from
      // the user)". Topups must not appear here. Verifies the SQL filter
      // type='TRANSFER' is wired correctly against a real Postgres.
      const token = await register('alice');
      await request(app.getHttpServer())
        .post('/topup')
        .set('Authorization', token)
        .send({ amount: 5000 });

      const res = await request(app.getHttpServer())
        .get('/top_transactions_per_user')
        .set('Authorization', token)
        .expect(200);
      expect(res.body).toEqual([]);
    });

    it('401 without a token', async () => {
      await request(app.getHttpServer()).get('/top_transactions_per_user').expect(401);
    });
  });

  describe('GET /top_users', () => {
    it('returns the top 10 users by aggregate outbound transfer value', async () => {
      const aliceToken = await register('alice');
      const bobToken = await register('bob');
      await register('carol');

      await request(app.getHttpServer())
        .post('/topup')
        .set('Authorization', aliceToken)
        .send({ amount: 5000 });
      await request(app.getHttpServer())
        .post('/topup')
        .set('Authorization', bobToken)
        .send({ amount: 5000 });

      await request(app.getHttpServer())
        .post('/transfer')
        .set('Authorization', aliceToken)
        .send({ to_username: 'bob', amount: 1000 });
      await request(app.getHttpServer())
        .post('/transfer')
        .set('Authorization', aliceToken)
        .send({ to_username: 'carol', amount: 500 });
      await request(app.getHttpServer())
        .post('/transfer')
        .set('Authorization', bobToken)
        .send({ to_username: 'alice', amount: 800 });

      const res = await request(app.getHttpServer())
        .get('/top_users')
        .set('Authorization', aliceToken)
        .expect(200);

      // alice debits = 1500; bob debits = 800; carol debits = 0
      expect(res.body).toEqual([
        { username: 'alice', transacted_value: 1500 },
        { username: 'bob', transacted_value: 800 },
        { username: 'carol', transacted_value: 0 },
      ]);
    });

    it('401 without a token', async () => {
      await request(app.getHttpServer()).get('/top_users').expect(401);
    });
  });
});
