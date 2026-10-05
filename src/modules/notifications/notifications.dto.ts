import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, Max, Min } from 'class-validator';
import { IsOptionalNotNull } from '../../common/decorators/validation.decorators';

export class QueryNotificationsDto {
  @ApiPropertyOptional({ enum: ['all', 'unread'], default: 'all' })
  @IsOptionalNotNull()
  @IsIn(['all', 'unread'])
  filter: 'all' | 'unread' = 'all';

  @ApiPropertyOptional({ default: 1 })
  @IsOptionalNotNull()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  page = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptionalNotNull()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class NotificationDto {
  @ApiProperty() id: string;
  @ApiProperty() type: string;
  @ApiProperty() title: string;
  @ApiProperty() body: string;
  @ApiProperty() entityType: string;
  @ApiProperty() entityId: string;
  @ApiProperty({ format: 'date-time' }) createdAt: Date;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  readAt: Date | null;
}

export class NotificationPageDto {
  @ApiProperty({ type: [NotificationDto] }) data: NotificationDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
}

export class NotificationCountDto {
  @ApiProperty() count: number;
}
