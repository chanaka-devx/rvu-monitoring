import { Catch, Controller, Get, Inject, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { currentContext } from '@rvu/platform';
import { problemFor } from './errors';
import { PLATFORM, type Platform } from './platform.module';

interface Response {
  status(code: number): Response;
  type(contentType: string): Response;
  json(body: unknown): void;
}
@Catch()
export class ProblemFilter implements ExceptionFilter {
  constructor(private readonly platform: Platform) {}
  catch(error: unknown, host: ArgumentsHost): void {
    const problem = problemFor(error, currentContext().correlationId);
    if (problem.status >= 500) this.platform.logger.error({ err: error }, 'Request failed');
    host.switchToHttp().getResponse<Response>().status(problem.status).type('application/problem+json').json(problem);
  }
}
@Controller('api/v1/health')
export class ReadyController {
  constructor(@Inject(PLATFORM) private readonly platform: Platform) {}
  @Get('ready')
  async ready(): Promise<{ status: string }> {
    const { ServiceUnavailableException } = await import('@nestjs/common');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([this.platform.pool.query('select 1'), new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Readiness timeout')), 2000);
      })]);
      return { status: 'ok' };
    } catch { throw new ServiceUnavailableException('Database is unavailable'); }
    finally { clearTimeout(timer); }
  }
}
