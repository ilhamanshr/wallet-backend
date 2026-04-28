import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Health probe', description: 'Returns 200 when the API is ready. Used by Railway deploy healthcheck.' })
  @ApiResponse({ status: 200, description: 'API is healthy', schema: { example: { status: 'ok', uptime: 42.5 } } })
  check(): { status: string; uptime: number } {
    return { status: 'ok', uptime: process.uptime() };
  }
}
