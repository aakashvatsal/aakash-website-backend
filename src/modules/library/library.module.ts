import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { LibraryController } from './library.controller';
import { LibraryService } from './library.service';

import {
  LibraryHighlight,
  LibraryHighlightSchema,
} from './schemas/library-highlight.schema';

import { LibraryItem, LibraryItemSchema } from './schemas/library-item.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: LibraryItem.name,
        schema: LibraryItemSchema,
      },
      {
        name: LibraryHighlight.name,
        schema: LibraryHighlightSchema,
      },
    ]),
  ],

  controllers: [LibraryController],

  providers: [LibraryService],

  exports: [LibraryService, MongooseModule],
})
export class LibraryModule {}
