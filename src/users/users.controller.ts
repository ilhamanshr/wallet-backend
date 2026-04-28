import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { RegisterUserDto } from './dto/register-user.dto';
import { RegisterResult, UsersService } from './users.service';

@ApiTags('auth')
@Controller('user')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new user', description: 'Creates a user and returns a JWT token. Username must be unique.' })
  @ApiResponse({ status: 201, description: 'User registered', schema: { example: { token: 'eyJ...' } } })
  @ApiResponse({ status: 400, description: 'Invalid username' })
  @ApiResponse({ status: 409, description: 'Username already exists' })
  register(@Body() body: RegisterUserDto): Promise<RegisterResult> {
    return this.users.register(body.username);
  }
}
