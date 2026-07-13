import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

/**
 * Public health-check endpoint.
 * Used by Docker HEALTHCHECK, load-balancer probes, and uptime monitors.
 * No auth required.
 */
@ApiTags('health')
@Controller()
export class AppController {
  @Get('health')
  @ApiOperation({ summary: 'Health check — returns 200 OK when server is ready' })
  health() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
    };
  }
}
