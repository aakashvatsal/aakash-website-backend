import { Test, TestingModule } from '@nestjs/testing';
import { HsakaaController } from './hsakaa.controller';
import { HsakaaService } from './hsakaa.service';

describe('HsakaaController', () => {
  let controller: HsakaaController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HsakaaController],
      providers: [HsakaaService],
    }).compile();

    controller = module.get<HsakaaController>(HsakaaController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
