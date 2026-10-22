import { Controller, Get } from '@nestjs/common';

export interface LivenessResponse {
  status: 'ok';
}

export interface ReadinessResponse {
  status: 'ready';
}

@Controller('api/v1/health')
export class HealthController {
  @Get('live')
  live(): LivenessResponse {
    return { status: 'ok' };
  }

  @Get('ready')
  ready(): ReadinessResponse {
    return { status: 'ready' };
  }
}
