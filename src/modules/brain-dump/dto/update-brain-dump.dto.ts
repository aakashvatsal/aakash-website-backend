import { PartialType } from '@nestjs/mapped-types';
import { CreateBrainDumpDto } from './create-brain-dump.dto';

export class UpdateBrainDumpDto extends PartialType(CreateBrainDumpDto) {}
