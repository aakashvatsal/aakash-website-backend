import { Test, TestingModule } from '@nestjs/testing';
import { HaircareController } from './haircare.controller';

describe('HaircareController', () => {
  let controller: HaircareController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HaircareController],
    })
      .useMocker(() => ({ get: jest.fn() }))
      .compile();

    controller = module.get<HaircareController>(HaircareController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
