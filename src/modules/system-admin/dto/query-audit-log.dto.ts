import { IsOptional, IsString, IsUUID } from 'class-validator';

export class QueryAuditLogDto {
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  entityType?: string;
}
