import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { PlatformModule } from './platform/platform.module';
import { ReadyController } from './platform/http';

@Module({
  imports: [PlatformModule],
  controllers: [HealthController, ReadyController],
})
export class AppModule {}
