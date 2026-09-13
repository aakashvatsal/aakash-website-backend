import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';

import { MemoryService } from '../modules/memory/memory.service';
import { HobbiesService } from '../modules/hobbies/hobbies.service';
import { NowService } from '../modules/now/now.service';
import { HsakaaMode } from './dto/ask-hsakaa.dto';

export interface HsakaaAgentContextBundle {
  sections: string[];
  memoryIds: Types.ObjectId[];
  retrievedMemoryCount: number;
}

@Injectable()
export class HsakaaAgentContextService {
  constructor(
    private readonly memoryService: MemoryService,
    private readonly nowService: NowService,
    private readonly hobbiesService: HobbiesService,
  ) {}

  async build(
    mode: HsakaaMode,
    message: string,
  ): Promise<HsakaaAgentContextBundle> {
    const memoryLimit = mode === HsakaaMode.MEMORY ? 12 : 6;

    const [memoryResult, nowResult, hobbiesResult] = await Promise.allSettled([
      this.memoryService.recall({
        query: message,
        limit: memoryLimit,
      }),
      this.nowService.getCurrent(),
      this.hobbiesService.getOverview(),
    ]);

    const sections: string[] = [];
    const memoryIds: Types.ObjectId[] = [];

    if (memoryResult.status === 'fulfilled') {
      const memories = memoryResult.value.current ?? [];
      memoryIds.push(...memories.map(({ memory }) => memory._id));

      if (memories.length > 0) {
        sections.push(
          this.formatSection(
            'DETERMINISTIC PRIVATE MEMORY RECALL',
            { plan: memoryResult.value.plan, results: memories },
            mode === HsakaaMode.MEMORY ? 12000 : 7000,
          ),
        );
      }
    }

    if (nowResult.status === 'fulfilled' && nowResult.value) {
      sections.push(
        this.formatSection('CURRENT PRIVATE NOW STATUS', nowResult.value, 4500),
      );
    }

    if (hobbiesResult.status === 'fulfilled') {
      sections.push(
        this.formatSection(
          'HOBBIES / DELIBERATE PRACTICE',
          hobbiesResult.value,
          6500,
        ),
      );
    }

    return {
      sections,
      memoryIds,
      retrievedMemoryCount:
        memoryResult.status === 'fulfilled'
          ? memoryResult.value.current.length
          : 0,
    };
  }

  private formatSection(
    label: string,
    data: unknown,
    maximumCharacters: number,
  ) {
    const serialized = JSON.stringify(data, null, 2);
    const clipped =
      serialized.length > maximumCharacters
        ? `${serialized.slice(0, maximumCharacters)}\n...[truncated]`
        : serialized;

    return `${label}\n${clipped}`;
  }

  private getSearchTerms(message: string, maximumTerms = 6) {
    const stopWords = new Set([
      'aakash',
      'about',
      'anything',
      'does',
      'from',
      'have',
      'hsakaa',
      'into',
      'most',
      'right',
      'that',
      'this',
      'what',
      'when',
      'where',
      'which',
      'with',
      'your',
    ]);

    return message
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 2 && !stopWords.has(token))
      .slice(0, maximumTerms)
      .join(' ');
  }
}
