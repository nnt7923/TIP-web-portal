# Notifications

Thông báo trong web được lưu cùng transaction với nghiệp vụ. Không gửi email,
không có worker, không backfill dữ liệu cũ và chưa tự động xóa lịch sử.

## API

Tất cả endpoint yêu cầu JWT, luôn lấy người nhận từ tài khoản đăng nhập.

| Endpoint | Kết quả |
| --- | --- |
| `GET /notifications?filter=all&page=1&limit=20` | `{ data, total, page, limit }`; `filter=unread` để chỉ xem chưa đọc; limit tối đa 100 |
| `GET /notifications/unread-count` | `{ count }` |
| `PATCH /notifications/:id/read` | Bản ghi thông báo; gọi lại giữ nguyên `readAt`; ID không thuộc người gọi trả 404 |
| `PATCH /notifications/read-all` | `{ count }` số mục vừa đánh dấu; giới hạn tại thời điểm server nhận xử lý |

Mỗi mục trả `id`, `type`, `title`, `body`, `entityType`, `entityId`, `createdAt`,
`readAt`. Không nhận recipient, nội dung hoặc URL từ client. Swagger có schema
cho danh sách, bản ghi và số lượng. Direct/mobile clients có thể dùng Bearer JWT.

## Sự kiện

- Sau xác thực email, hồ sơ trường/nhân sự PENDING thông báo System Admin;
  nhân sự thông báo thêm admin tổ chức. Khóa sự kiện theo profile chống trùng khi
  email thay đổi và xác thực lại.
- Duyệt trường/nhân sự thông báo chủ hồ sơ. Gửi yêu cầu sinh viên thông báo admin
  trường; duyệt/từ chối thông báo người gửi, không chứa lý do riêng tư.
- Nộp/rút ứng tuyển thông báo admin doanh nghiệp. Xét/chấp nhận/từ chối thông báo sinh viên.
- Đăng ký đợt thông báo sinh viên. Tạo thực tập thông báo sinh viên, admin công ty,
  người hướng dẫn. Đổi thông tin/trạng thái thông báo thêm admin/staff trường.
  Đổi người hướng dẫn thông báo sinh viên và người hướng dẫn cũ/mới.

Người nhận có tài khoản ACTIVE, chưa xóa; người nhận theo hồ sơ có hồ sơ ACTIVE
đúng tổ chức. Người thực hiện bị loại, các vai trò trùng được gộp. Thông báo không
thay thế quyền đọc bản ghi. Không phát khi cập nhật thực tập không đổi giá trị.

`NotificationsModule` global và không phụ thuộc AuthModule để tránh vòng phụ thuộc.
`NotificationEventsService` xác định sự kiện/người nhận; `NotificationsService.emit`
chỉ ghi bằng transaction client do service nghiệp vụ truyền vào.

## Realtime and release

The REST API remains authoritative. See [WebSocket contract and operations](notifications-realtime.md) and [release review](release-review-20261007.md).

Business writes use NotificationEventsService.transaction; inserted recipient IDs are collected inside the transaction and published only after commit. Failed publication is logged without undoing committed business data. There is no new migration or historical backfill for realtime.

The frontend uses a shared authenticated socket per tab, 30-second polling when disconnected, and 120-second reconciliation when connected. Fixed internal links still fetch the target through its authorized API; notifications grant no additional access.
