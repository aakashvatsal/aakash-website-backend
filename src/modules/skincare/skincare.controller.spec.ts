import { Test, TestingModule } from '@nestjs/testing';
import { SkincareController } from './skincare.controller';

describe('SkincareController', () => {
  let controller: SkincareController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SkincareController],
    })
      .useMocker(() => ({ get: jest.fn() }))
      .compile();

    controller = module.get<SkincareController>(SkincareController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
