import { Test, TestingModule } from '@nestjs/testing';
import { SupplementsController } from './supplements.controller';

describe('SupplementsController', () => {
  let controller: SupplementsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SupplementsController],
    }).compile();

    controller = module.get<SupplementsController>(SupplementsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
