import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CloudinaryModule } from './cloudinary/cloudinary.module';
import { envValidationSchema } from './config/env.validation';
import { PrismaModule } from './database/prisma.module';
import { HealthModule } from './health/health.module';
import { UniversitiesModule } from './modules/universities/universities.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { EmailModule } from './email/email.module';
import { SystemAdminModule } from './modules/system-admin/system-admin.module';
import { SchoolUserModule } from './modules/schooluser/schooluser.module';
import { MajorModule } from './modules/major/major.module';
import { AcademicYearModule } from './modules/academic-year/academic-year.module';
import { InternshipPeriodModule } from './modules/internship-period/internship-period.module';
import { StudentModule } from './modules/student/student.module';
import { CompanyModule } from './modules/company/company.module';
import { CompanyUserModule } from './modules/companyuser/company-user.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validationSchema: envValidationSchema,
    }),
    PrismaModule,
    RedisModule,
    CloudinaryModule,
    HealthModule,
    UniversitiesModule,
    AuthModule,
    EmailModule,
    SystemAdminModule,
    SchoolUserModule,
    MajorModule,
    AcademicYearModule,
    InternshipPeriodModule,
    StudentModule,
    CompanyModule,
    CompanyUserModule,
  ],
})
export class AppModule {}
