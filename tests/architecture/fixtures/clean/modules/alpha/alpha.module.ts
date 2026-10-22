import { alphaService } from './application/alpha-service';
import { alpha } from './domain/alpha';
import { alphaRepository } from './infrastructure/alpha-repository';
import { alphaController } from './interface/alpha-controller';

export class AlphaModule {
  readonly service = alphaService;
  readonly domain = alpha;
  readonly repository = alphaRepository;
  readonly controller = alphaController;
}
