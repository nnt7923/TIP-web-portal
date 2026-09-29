import { IsString, IsUUID, MaxLength } from 'class-validator';
import {
  IsOptionalNotNull,
  Trim,
} from '../../../common/decorators/validation.decorators';

export class QueryLookupDto {
  @IsOptionalNotNull()
  @IsString()
  @Trim()
  @MaxLength(100)
  keyword?: string;

  @IsOptionalNotNull()
  @IsUUID()
  companyId?: string;

  @IsOptionalNotNull()
  @IsUUID()
  studentId?: string;

  @IsOptionalNotNull()
  @IsUUID()
  applicationId?: string;

  @IsOptionalNotNull()
  @IsUUID()
  placementId?: string;
}
