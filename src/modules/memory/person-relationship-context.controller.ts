import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';

import {
  RelationshipContactGapQueryDto,
  RelationshipContextSearchQueryDto,
  UpdatePersonRelationshipContextDto,
} from './dto/person-relationship-context.dto';
import { PersonRelationshipContextService } from './person-relationship-context.service';

@Controller('memory-people')
export class PersonRelationshipContextController {
  constructor(
    private readonly relationshipContextService: PersonRelationshipContextService,
  ) {}

  @Get('relationship-context/dormant')
  getContactGaps(@Query() query: RelationshipContactGapQueryDto) {
    return this.relationshipContextService.getContactGaps(query);
  }

  @Get('relationship-context/search')
  findByContext(@Query() query: RelationshipContextSearchQueryDto) {
    return this.relationshipContextService.findPeopleByContext(query);
  }

  @Get(':personId/relationship-context')
  getForPerson(@Param('personId') personId: string) {
    return this.relationshipContextService.getForPerson(personId);
  }

  @Patch(':personId/relationship-context')
  update(
    @Param('personId') personId: string,
    @Body() dto: UpdatePersonRelationshipContextDto,
  ) {
    return this.relationshipContextService.update(personId, dto);
  }
}
