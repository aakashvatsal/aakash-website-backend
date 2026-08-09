import { Test, TestingModule } from '@nestjs/testing';
import { MeditationController } from './meditation.controller';

describe('MeditationController', () => {
  let controller: MeditationController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MeditationController],
    }).compile();

    controller = module.get<MeditationController>(MeditationController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
