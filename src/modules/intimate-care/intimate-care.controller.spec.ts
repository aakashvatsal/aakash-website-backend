import { Test, TestingModule } from '@nestjs/testing';
import { IntimateCareController } from './intimate-care.controller';

describe('IntimateCareController', () => {
  let controller: IntimateCareController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [IntimateCareController],
    }).compile();

    controller = module.get<IntimateCareController>(IntimateCareController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
