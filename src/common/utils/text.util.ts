/** Chuẩn hóa mã định danh bằng cách xóa khoảng trắng và chuyển thành chữ hoa. */
export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

/** Xóa khoảng trắng ở hai đầu của một chuỗi không bắt buộc. */
export function normalizeOptionalText(value?: string): string | undefined {
  return value?.trim();
}
