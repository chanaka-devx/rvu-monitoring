import { kernel } from '../../../packages/shared-kernel/src/index';
import { AlphaModule } from '../../../modules/alpha/alpha.module';
import { alphaController, alphaService } from '../../../modules/alpha/public-api';

export const application = {
  module: AlphaModule,
  controller: alphaController,
  service: alphaService,
  kernel
};
