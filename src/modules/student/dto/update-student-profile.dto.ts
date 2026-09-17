import { IsNotEmpty, IsString } from 'class-validator';
import {
  IsOptionalNotNull,
  Trim,
} from '../../../common/decorators/validation.decorators';

/** Sinh viên chỉ được sửa thông tin cá nhân, không tự sửa ngành/mã/trạng thái. */
export class UpdateStudentProfileDto {
  @IsOptionalNotNull()
  @Trim()
  @IsString()
  @IsNotEmpty()
  fullName?: string;

  @IsOptionalNotNull()
  @Trim()
  @IsString()
  phone?: string;

  @IsOptionalNotNull()
  @Trim()
  @IsString()
  cvUrl?: string;
}
