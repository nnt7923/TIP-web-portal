import { Transform } from 'class-transformer';
import { ValidateIf } from 'class-validator';

/** Cho phép bỏ qua field, nhưng vẫn kiểm tra nếu client gửi null. */
export function IsOptionalNotNull(): PropertyDecorator {
  return ValidateIf((_object: unknown, value: unknown) => value !== undefined);
}

/** Trim trước validation để chuỗi chỉ có khoảng trắng không được chấp nhận. */
export function Trim(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );
}
