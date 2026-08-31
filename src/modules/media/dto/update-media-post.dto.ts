import { PartialType } from '@nestjs/mapped-types';

import { CreateMediaPostDto } from './create-media-post.dto';

export class UpdateMediaPostDto extends PartialType(CreateMediaPostDto) {}
