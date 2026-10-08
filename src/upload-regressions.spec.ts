import {
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
  ExecutionContext,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { Server } from 'node:http';
import { join } from 'node:path';
import request from 'supertest';
import { CloudinaryService } from './cloudinary/cloudinary.service';
import { CurrentUserData } from './common/decorators/current-user.decorator';
import { UploadedCvFile } from './common/cv-upload';
import { PrismaService } from './database/prisma.service';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth-guard';
import { StudentController } from './modules/student/student.controller';
import { StudentService } from './modules/student/student.service';
import { CompanyController } from './modules/company/company.controller';
import { CompanyService } from './modules/company/company.service';
import { UniversitiesController } from './modules/universities/universities.controller';
import { UniversitiesService } from './modules/universities/universities.service';

const id = '11111111-1111-4111-8111-111111111111';
const student = {
  id: 'account',
  student: { id, universityId: 'school' },
} as CurrentUserData;
const admin = {
  id: 'admin',
  schoolUser: {
    universityId: 'school',
    role: 'UNIVERSITY_ADMIN',
    status: 'ACTIVE',
  },
  globalRole: 'SYSTEM_ADMIN',
} as CurrentUserData;
const pdf = readFileSync(join(__dirname, 'common/fixtures/sample.pdf'));
const upload: UploadedCvFile = {
  buffer: pdf,
  originalname: 'cv.pdf',
  mimetype: '',
};
const p2025 = () =>
  new Prisma.PrismaClientKnownRequestError('compare-and-swap failed', {
    code: 'P2025',
    clientVersion: 'test',
  });

function setup(kind: 'student' | 'company' | 'university') {
  const url = kind === 'student' ? 'cvUrl' : 'logoUrl';
  const publicId = kind === 'student' ? 'cvPublicId' : 'logoPublicId';
  let record: Record<string, unknown> | null = {
    id,
    universityId: 'school',
    status: 'VERIFIED',
    [url]: 'https://assets/old',
    [publicId]: 'old',
    account: {},
  };
  const model = {
    findFirst: jest.fn(({ where }: { where: { universityId?: string } }) =>
      Promise.resolve(
        record &&
          (!where.universityId || where.universityId === record.universityId)
          ? { ...record }
          : null,
      ),
    ),
    findUnique: jest.fn(() => Promise.resolve(record && { ...record })),
    findUniqueOrThrow: jest.fn(() => Promise.resolve(record && { ...record })),
    update: jest.fn(
      ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        if (
          !record ||
          [url, publicId].some(
            (key) => key in where && where[key] !== record![key],
          )
        )
          throw p2025();
        record = { ...record, ...data };
        return Promise.resolve({ ...record });
      },
    ),
    delete: jest.fn(({ where }: { where: Record<string, unknown> }) => {
      if (!record || [url, publicId].some((key) => where[key] !== record![key]))
        throw p2025();
      const old = record;
      record = null;
      return Promise.resolve(old);
    }),
  };
  const db = {
    [kind]: model,
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) =>
    fn(db),
  );
  const created: string[] = [];
  const deleted: string[] = [];
  const cloud = {
    uploadBuffer: jest.fn(
      (_buffer: Buffer, options: { public_id?: string }) => {
        const key = options.public_id ?? `new-${created.length}`;
        created.push(key);
        return Promise.resolve({
          public_id: key,
          secure_url: `https://assets/${key}`,
        });
      },
    ),
    destroySafely: jest.fn((key: string) => {
      deleted.push(key);
      return Promise.resolve();
    }),
  };
  const prisma = db as unknown as PrismaService;
  const provider = cloud as unknown as CloudinaryService;
  const service = new StudentService(prisma, provider);
  const change =
    kind === 'student'
      ? () => service.updateMe(student, {}, upload)
      : kind === 'company'
        ? () =>
            new CompanyService(prisma, provider).update('admin', id, {}, upload)
        : () =>
            new UniversitiesService(prisma, provider).update(
              'admin',
              id,
              {},
              upload,
            );
  const remove =
    kind === 'student'
      ? () => service.remove(admin, id)
      : kind === 'company'
        ? () => new CompanyService(prisma, provider).remove('admin', id)
        : () => new UniversitiesService(prisma, provider).remove(id);
  return {
    model,
    service,
    change,
    remove,
    created,
    deleted,
    cloud,
    record: () => record,
    publicId,
  };
}

describe.each(['student', 'company', 'university'] as const)(
  '%s asset replacement',
  (kind) => {
    it('lets one concurrent replacement win and deletes only the losing upload and old asset', async () => {
      const ctx = setup(kind);
      const outcomes = await Promise.allSettled([ctx.change(), ctx.change()]);
      expect(
        outcomes.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        outcomes.find((result) => result.status === 'rejected'),
      ).toMatchObject({ reason: { status: 409 } });
      const winner = ctx.record()![ctx.publicId];
      expect(ctx.deleted).not.toContain(winner);
      expect(ctx.deleted.filter((key) => key === 'old')).toHaveLength(1);
      expect(
        ctx.created.filter(
          (key) => key !== winner && !ctx.deleted.includes(key),
        ),
      ).toEqual([]);
    });
    it('cleans a new asset after database failure and preserves the old asset', async () => {
      const ctx = setup(kind);
      ctx.model.update.mockRejectedValueOnce(new Error('database offline'));
      await expect(ctx.change()).rejects.toThrow('database offline');
      expect(ctx.record()![ctx.publicId]).toBe('old');
      expect(ctx.deleted).toEqual(ctx.created);
    });
    it('preserves database and old asset when the storage provider fails', async () => {
      const ctx = setup(kind);
      ctx.cloud.uploadBuffer.mockRejectedValueOnce(
        new Error('storage unavailable'),
      );
      await expect(ctx.change()).rejects.toThrow('storage unavailable');
      expect(ctx.record()![ctx.publicId]).toBe('old');
      expect(ctx.model.update).not.toHaveBeenCalled();
      expect(ctx.deleted).toEqual([]);
    });
    it('does not orphan an upload when deletion races replacement', async () => {
      const ctx = setup(kind);
      const results = await Promise.allSettled([ctx.change(), ctx.remove()]);
      expect(results.some((result) => result.status === 'fulfilled')).toBe(
        true,
      );
      const winner = ctx.record()?.[ctx.publicId];
      expect(
        ctx.created.filter(
          (key) => key !== winner && !ctx.deleted.includes(key),
        ),
      ).toEqual([]);
      if (winner) expect(ctx.deleted).not.toContain(winner);
    });
  },
);

describe('Student file ownership and clearing', () => {
  it('never uploads for a student outside the authenticated university', async () => {
    const ctx = setup('student');
    await expect(
      ctx.service.update(
        {
          ...admin,
          schoolUser: { ...admin.schoolUser!, universityId: 'other-school' },
        },
        id,
        {},
        upload,
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(ctx.cloud.uploadBuffer).not.toHaveBeenCalled();
  });
  it('clears and replaces concurrently without leaving an orphan', async () => {
    const ctx = setup('student');
    await Promise.allSettled([
      ctx.change(),
      ctx.service.updateMe(student, { cvUrl: '' }),
    ]);
    const winner = ctx.record()?.cvPublicId;
    expect(
      ctx.created.filter((key) => key !== winner && !ctx.deleted.includes(key)),
    ).toEqual([]);
    if (winner) expect(ctx.deleted).not.toContain(winner);
  });
  it('saving phone does not touch the CV or delete any file', async () => {
    const ctx = setup('student');
    await ctx.service.updateMe(student, { phone: '0901234567' });
    expect(ctx.record()?.cvPublicId).toBe('old');
    expect(ctx.cloud.uploadBuffer).not.toHaveBeenCalled();
    expect(ctx.deleted).toEqual([]);
  });
});

describe('Multipart API contracts with real controllers and role guards', () => {
  let app: INestApplication;
  const forwarded = jest.fn((...args: unknown[]) => ({
    fileReceived: !!(args.at(-1) as { buffer?: Buffer } | undefined)?.buffer,
  }));
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [
        StudentController,
        CompanyController,
        UniversitiesController,
      ],
      providers: [
        {
          provide: StudentService,
          useValue: {
            create: forwarded,
            updateMe: forwarded,
            update: forwarded,
          },
        },
        {
          provide: CompanyService,
          useValue: { create: forwarded, update: forwarded },
        },
        {
          provide: UniversitiesService,
          useValue: { create: forwarded, update: forwarded },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          const http = context.switchToHttp();
          const req = http.getRequest<{
            headers: Record<string, string>;
            user: CurrentUserData;
          }>();
          const token = req.headers.authorization;
          if (!['Bearer student', 'Bearer admin'].includes(token))
            throw new UnauthorizedException();
          req.user = token === 'Bearer admin' ? admin : student;
          return true;
        },
      })
      .compile();
    app = module.createNestApplication({ logger: false });
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  it.each(['simple.doc', 'sample.docx'])(
    'accepts real %s through /students/me',
    async (name) => {
      await request(app.getHttpServer() as Server)
        .patch('/students/me')
        .set('Authorization', 'Bearer student')
        .attach('cv', readFileSync(join(__dirname, 'common/fixtures', name)), {
          filename: name,
          contentType: 'application/octet-stream',
        })
        .expect(200, { fileReceived: true });
    },
  );
  it('accepts PDF with generic MIME and rejects a fake PDF', async () => {
    await request(app.getHttpServer() as Server)
      .patch('/students/me')
      .set('Authorization', 'Bearer student')
      .attach('cv', pdf, {
        filename: 'CV.PDF',
        contentType: 'application/octet-stream',
      })
      .expect(200);
    await request(app.getHttpServer() as Server)
      .patch('/students/me')
      .set('Authorization', 'Bearer student')
      .attach('cv', Buffer.from('fake'), 'cv.pdf')
      .expect(400);
  });
  it('uses the same Word validator for admin create and update', async () => {
    const word = readFileSync(join(__dirname, 'common/fixtures/sample.docx'));
    await request(app.getHttpServer() as Server)
      .post('/students')
      .set('Authorization', 'Bearer admin')
      .field({
        fullName: 'Upload fixture',
        username: 'fixture',
        email: 'fixture@example.invalid',
        password: 'fixture-password',
        majorId: id,
        studentCode: 'UPLOAD001',
        semester: '5',
        className: 'TEST',
      })
      .attach('cv', word, 'CV.DOCX')
      .expect(201, { fileReceived: true });
    await request(app.getHttpServer() as Server)
      .patch(`/students/${id}`)
      .set('Authorization', 'Bearer admin')
      .attach('cv', word, 'CV.DOCX')
      .expect(200, { fileReceived: true });
  });
  it('enforces one file, correct field, size and authentication', async () => {
    await request(app.getHttpServer() as Server)
      .patch('/students/me')
      .set('Authorization', 'Bearer student')
      .attach('cv', Buffer.alloc(4194305), 'cv.pdf')
      .expect(413);
    await request(app.getHttpServer() as Server)
      .patch('/students/me')
      .set('Authorization', 'Bearer student')
      .attach('wrong', pdf, 'cv.pdf')
      .expect(400);
    await request(app.getHttpServer() as Server)
      .patch('/students/me')
      .set('Authorization', 'Bearer student')
      .attach('cv', pdf, 'one.pdf')
      .attach('cv', pdf, 'two.pdf')
      .expect(400);
    await request(app.getHttpServer() as Server)
      .patch('/students/me')
      .attach('cv', pdf, 'cv.pdf')
      .expect(401);
    await request(app.getHttpServer() as Server)
      .patch('/students/me')
      .set('Authorization', 'Bearer expired')
      .attach('cv', pdf, 'cv.pdf')
      .expect(401);
    await request(app.getHttpServer() as Server)
      .patch(`/students/${id}`)
      .set('Authorization', 'Bearer student')
      .attach('cv', pdf, 'cv.pdf')
      .expect(403);
  });
  it.each(['companies', 'universities'])(
    'forwards %s logos, preserves JSON and enforces admin permission',
    async (path) => {
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6GQAAAABJRU5ErkJggg==',
        'base64',
      );
      await request(app.getHttpServer() as Server)
        .patch(`/${path}/${id}`)
        .set('Authorization', 'Bearer admin')
        .attach('logo', png, 'logo.png')
        .expect(200, { fileReceived: true });
      await request(app.getHttpServer() as Server)
        .post(`/${path}`)
        .set('Authorization', 'Bearer admin')
        .field(
          path === 'universities'
            ? { name: 'Fixture school', code: 'FIX' }
            : { name: 'Fixture company' },
        )
        .attach('logo', png, 'logo.png')
        .expect(201, { fileReceived: true });
      await request(app.getHttpServer() as Server)
        .patch(`/${path}/${id}`)
        .set('Authorization', 'Bearer admin')
        .send({ logoUrl: 'https://example.com/logo.png' })
        .expect(200, { fileReceived: false });
      await request(app.getHttpServer() as Server)
        .patch(`/${path}/${id}`)
        .set('Authorization', 'Bearer student')
        .attach('logo', png, 'logo.png')
        .expect(403);
    },
  );
});
