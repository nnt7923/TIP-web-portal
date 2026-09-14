# TIP Web Portal API

Backend API dùng **NestJS 11**, **PostgreSQL**, **Prisma 6**, **Redis** và **Cloudinary**.

## Yêu cầu

- Node.js 20 LTS trở lên (khuyến nghị Node.js 22.13+)
- npm
- PostgreSQL đang hoạt động
- Redis đang hoạt động
- Tài khoản Cloudinary nếu cần upload media

## Chạy lần đầu

```bash
# 1. Cài dependency
npm install

# 2. Tạo file cấu hình local
cp .env.example .env

# 3. Cập nhật DATABASE_URL và REDIS_URL trong .env

# 4. Generate Prisma Client và tạo/cập nhật database
npm run db:generate
npm run db:migrate -- --name init

# 5. Chạy NestJS ở chế độ development
npm run start:dev
```

Trên PowerShell, có thể dùng lệnh sau thay cho `cp`:

```powershell
Copy-Item .env.example .env
```

API chạy tại `http://localhost:3000/api`. Kiểm tra kết nối PostgreSQL và Redis:

```text
GET http://localhost:3000/api/health
```

## Redis qua Docker (local development)

Mở Docker Desktop và chờ engine chạy, sau đó chạy tại thư mục dự án:

```bash
npm run redis:up
npm run redis:ping
```

Lệnh đầu tải image Redis và chờ container healthy. Lệnh kiểm tra phải trả về `PONG`.
Giữ `REDIS_URL=redis://localhost:6379` trong `.env` khi chạy NestJS trên máy host.
Redis chỉ mở cổng `6379` trên `127.0.0.1`, dùng AOF và volume `redis-data` để lưu dữ liệu.
Cấu hình này dành cho phát triển local, không có mật khẩu.

```bash
docker compose ps
docker compose logs --tail 50 redis
npm run redis:stop
```

`redis:stop` giữ dữ liệu; `docker compose down -v` sẽ xóa volume và dữ liệu Redis.

## Cloudinary

Điền ba giá trị lấy từ Cloudinary Console vào `.env`:

```dotenv
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

`CloudinaryService` đã cung cấp sẵn:

- `uploadBuffer(buffer, options)` để upload file từ memory buffer.
- `destroy(publicId)` để xóa asset.

Không commit `.env`; file này đã được thêm vào `.gitignore`.

## Cấu trúc chính

```text
src/
├── cloudinary/       # Cloudinary provider và service
├── config/           # Kiểm tra biến môi trường bằng Joi
├── database/         # Prisma module/service
├── health/           # Health endpoint
├── redis/            # Redis module/service
├── app.module.ts
└── main.ts
prisma/
└── schema.prisma     # Database schema
```

## Lệnh hữu ích

| Lệnh | Chức năng |
| --- | --- |
| `npm run start:dev` | Chạy API và tự reload |
| `npm run build` | Build production |
| `npm run test` | Chạy unit test |
| `npm run test:e2e` | Chạy integration test (cần PostgreSQL và Redis đang hoạt động) |
| `npm run lint` | Kiểm tra và sửa lint |
| `npm run db:migrate -- --name <name>` | Tạo và chạy migration |
| `npm run db:deploy` | Chạy migration khi deploy |
| `npm run db:studio` | Mở Prisma Studio |

## Database mẫu

`prisma/schema.prisma` có model `User` tối thiểu để xác nhận Prisma hoạt động. Thay đổi schema theo nghiệp vụ, sau đó tạo migration mới:

```bash
npm run db:migrate -- --name ten_migration
```
