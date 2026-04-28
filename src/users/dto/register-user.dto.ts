import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterUserDto {
  @ApiProperty({ example: 'alice', description: 'Unique username (3-64 chars, letters/digits/._-)' })
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9._-]+$/, {
    message: 'username may only contain letters, digits, dot, underscore, hyphen',
  })
  username!: string;
}
