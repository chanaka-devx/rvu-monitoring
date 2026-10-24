import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PLATFORM, type Platform } from './platform/platform.module';
import { ProblemFilter } from './platform/http';
import { CorrelationIdMiddleware } from './platform/correlation';
import { currentContext } from '@rvu/platform';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const platform = app.get<Platform>(PLATFORM);
  const correlation = new CorrelationIdMiddleware();
  app.use((req: { headers: Record<string, unknown>; method: string; route?: { path?: string } },
    res: { setHeader(name: string, value: string): void; statusCode: number; on(event: string, listener: () => void): void }, next: () => void) => {
    correlation.use(req, res, () => {
      const started = performance.now();
      const correlationId = currentContext().correlationId;
      res.on('finish', () => platform.logger.info({ method: req.method, route: req.route?.path ?? 'unmatched',
        status: res.statusCode, duration: performance.now() - started, correlationId }, 'request'));
      next();
    });
  });
  app.useGlobalFilters(new ProblemFilter(platform));
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

void bootstrap();
