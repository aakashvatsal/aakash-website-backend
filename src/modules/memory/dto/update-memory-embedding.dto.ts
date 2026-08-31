import { ArrayNotEmpty, IsArray, IsNumber } from 'class-validator';

export class UpdateMemoryEmbeddingDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsNumber({}, { each: true })
  embedding: number[];
}
