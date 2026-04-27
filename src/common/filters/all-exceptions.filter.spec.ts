import {
  ArgumentsHost,
  BadRequestException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AllExceptionsFilter } from './all-exceptions.filter';

interface FakeResponse {
  status: jest.Mock;
  json: jest.Mock;
}

function makeHost(): { host: ArgumentsHost; res: FakeResponse } {
  const res: FakeResponse = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => res,
      getRequest: () => ({}),
    }),
  } as unknown as ArgumentsHost;
  return { host, res };
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
  });

  it('passes through HttpException with its status and message', () => {
    const { host, res } = makeHost();

    filter.catch(new BadRequestException('bad input'), host);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(res.json).toHaveBeenCalledWith({
      statusCode: HttpStatus.BAD_REQUEST,
      error: 'BAD_REQUEST',
      message: 'bad input',
    });
  });

  it('preserves array message from class-validator (NotFoundException example)', () => {
    const { host, res } = makeHost();

    filter.catch(new NotFoundException(['missing field a', 'missing field b']), host);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    const body = res.json.mock.calls[0][0];
    expect(body.statusCode).toBe(HttpStatus.NOT_FOUND);
    expect(body.message).toEqual(['missing field a', 'missing field b']);
  });

  it('translates Prisma P2002 (unique violation) into 409 Conflict', () => {
    const { host, res } = makeHost();
    const prismaErr = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (`username`)',
      { code: 'P2002', clientVersion: 'test' },
    );

    filter.catch(prismaErr, host);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(res.json).toHaveBeenCalledWith({
      statusCode: HttpStatus.CONFLICT,
      error: 'Conflict',
      message: 'Resource already exists',
    });
  });

  it('returns generic 500 for unknown exceptions (and does not leak the message)', () => {
    const { host, res } = makeHost();

    filter.catch(new Error('something internal — should not be exposed'), host);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(res.json).toHaveBeenCalledWith({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'Unexpected error',
    });
  });

  it('does not classify other Prisma errors (e.g. P2025) as 409', () => {
    const { host, res } = makeHost();
    const otherPrismaErr = new Prisma.PrismaClientKnownRequestError('Record not found', {
      code: 'P2025',
      clientVersion: 'test',
    });

    filter.catch(otherPrismaErr, host);

    // Anything that isn't HttpException or P2002 falls through to 500.
    expect(res.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
  });
});
