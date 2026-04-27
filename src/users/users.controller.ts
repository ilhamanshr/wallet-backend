import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';

import { RegisterUserDto } from './dto/register-user.dto';
import { RegisterResult, UsersService } from './users.service';

@Controller('user')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  register(@Body() body: RegisterUserDto): Promise<RegisterResult> {
    return this.users.register(body.username);
  }
}
