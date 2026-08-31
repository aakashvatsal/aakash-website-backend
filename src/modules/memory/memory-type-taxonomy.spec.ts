import {
  MEMORY_CANONICAL_TYPES,
  MEMORY_LEGACY_TYPES,
  MEMORY_TYPE_SEMANTICS,
  MemoryType,
} from './schemas/memory.schema';

describe('Memory type taxonomy', () => {
  it('defines the complete canonical 4B taxonomy with unique values', () => {
    expect(MEMORY_CANONICAL_TYPES).toEqual([
      MemoryType.FACT,
      MemoryType.PREFERENCE,
      MemoryType.GOAL,
      MemoryType.COMMITMENT,
      MemoryType.BELIEF,
      MemoryType.LESSON,
      MemoryType.EVENT,
      MemoryType.RELATIONSHIP,
      MemoryType.ROUTINE,
      MemoryType.PROJECT_CONTEXT,
      MemoryType.OPINION,
      MemoryType.UNRESOLVED_QUESTION,
    ]);
    expect(new Set(MEMORY_CANONICAL_TYPES).size).toBe(
      MEMORY_CANONICAL_TYPES.length,
    );

    for (const type of MEMORY_CANONICAL_TYPES) {
      expect(MEMORY_TYPE_SEMANTICS[type]).toEqual(expect.any(String));
      expect(MEMORY_TYPE_SEMANTICS[type]?.length).toBeGreaterThan(20);
    }
  });

  it('keeps historical decision/experience/project values readable but outside new canonical capture', () => {
    expect(MEMORY_LEGACY_TYPES).toEqual([
      MemoryType.DECISION,
      MemoryType.EXPERIENCE,
      MemoryType.PROJECT,
    ]);

    for (const legacyType of MEMORY_LEGACY_TYPES) {
      expect(MEMORY_CANONICAL_TYPES).not.toContain(legacyType);
    }
  });
});
