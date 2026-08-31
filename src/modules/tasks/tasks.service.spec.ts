import { getModelToken } from '@nestjs/mongoose';

import { Test, TestingModule } from '@nestjs/testing';

import { CompaniesService } from '../companies/companies.service';

import { Task } from './schemas/task.schema';

import { TasksService } from './tasks.service';

describe('TasksService', () => {
  let service: TasksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        {
          provide: getModelToken(Task.name),
          useValue: {},
        },
        {
          provide: CompaniesService,
          useValue: {
            findOne: jest.fn(),
          },
        },
      ],
    })
      .useMocker(() => ({ get: jest.fn() }))
      .compile();

    service = module.get<TasksService>(TasksService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
