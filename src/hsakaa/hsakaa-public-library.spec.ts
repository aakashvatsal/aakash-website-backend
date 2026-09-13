import { Types } from 'mongoose';

import {
  LibraryItemStatus,
  LibraryItemType,
} from '../modules/library/schemas/library-item.schema';
import { HsakaaContextService } from './hsakaa-context.service';

describe('HsakaaContextService public book grounding', () => {
  function createService() {
    const readingId = new Types.ObjectId();
    const completedId = new Types.ObjectId();

    const libraryService = {
      findAll: jest.fn().mockImplementation((query: { status?: string }) => {
        if (query.status === LibraryItemStatus.READING) {
          return Promise.resolve({
            data: [
              {
                _id: readingId,
                title: 'Reading Book',
                type: LibraryItemType.BOOK,
                status: LibraryItemStatus.READING,
              },
            ],
          });
        }

        if (query.status === LibraryItemStatus.COMPLETED) {
          return Promise.resolve({
            data: [
              {
                _id: completedId,
                title: 'Completed Book',
                type: LibraryItemType.BOOK,
                status: LibraryItemStatus.COMPLETED,
              },
            ],
          });
        }

        return Promise.resolve({ data: [] });
      }),
      findOne: jest.fn().mockImplementation((id: string) =>
        Promise.resolve({
          _id: new Types.ObjectId(id),
          title:
            id === readingId.toString() ? 'Reading Book' : 'Completed Book',
          type: LibraryItemType.BOOK,
          status:
            id === readingId.toString()
              ? LibraryItemStatus.READING
              : LibraryItemStatus.COMPLETED,
          summary: 'Public curated summary',
        }),
      ),
      getHighlights: jest.fn().mockResolvedValue([
        {
          type: 'highlight',
          text: 'A public highlight',
          note: 'Aakash public note',
        },
      ]),
    };

    const service = new HsakaaContextService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      libraryService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    return { service, libraryService, readingId, completedId };
  }

  it('uses only public BOOK records marked READING or COMPLETED', async () => {
    const { service, libraryService } = createService();

    const data = await service['getLibraryData']('books that shaped you', 6);

    expect(data).toHaveLength(2);
    expect(libraryService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        type: LibraryItemType.BOOK,
        status: LibraryItemStatus.READING,
      }),
      true,
    );
    expect(libraryService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        type: LibraryItemType.BOOK,
        status: LibraryItemStatus.COMPLETED,
      }),
      true,
    );

    expect(libraryService.findAll).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: LibraryItemStatus.WANT_TO_READ }),
      true,
    );
    expect(libraryService.findAll).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: LibraryItemStatus.PAUSED }),
      true,
    );
    expect(libraryService.findAll).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: LibraryItemStatus.DROPPED }),
      true,
    );
  });

  it('adds only public highlight/note references through the public library API', async () => {
    const { service, libraryService, readingId, completedId } = createService();

    const data = await service['getLibraryData']('what did you learn?', 6);

    expect(libraryService.findOne).toHaveBeenCalledWith(
      readingId.toString(),
      true,
    );
    expect(libraryService.findOne).toHaveBeenCalledWith(
      completedId.toString(),
      true,
    );
    expect(libraryService.getHighlights).toHaveBeenCalledWith(
      readingId.toString(),
      true,
    );
    expect(libraryService.getHighlights).toHaveBeenCalledWith(
      completedId.toString(),
      true,
    );
    expect(data[0]).toEqual(
      expect.objectContaining({
        publicReferences: [
          expect.objectContaining({
            text: 'A public highlight',
            note: 'Aakash public note',
          }),
        ],
      }),
    );
  });
});
