import { Test, TestingModule } from '@nestjs/testing';
import { IntegrationsController } from './integrations.controller';

describe('IntegrationsController', () => {
  let controller: IntegrationsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [IntegrationsController],
    })
      .useMocker(() => ({ get: jest.fn() }))
      .compile();

    controller = module.get<IntegrationsController>(IntegrationsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
