import { Test, TestingModule } from '@nestjs/testing';
import { NowController } from './now.controller';

describe('NowController', () => {
  let controller: NowController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NowController],
    }).compile();

    controller = module.get<NowController>(NowController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
