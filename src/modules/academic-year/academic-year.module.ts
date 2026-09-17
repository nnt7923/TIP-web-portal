import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AcademicYearController } from './academic-year.controller';
import { AcademicYearService } from './academic-year.service';

@Module({
  imports: [AuthModule],
  controllers: [AcademicYearController],
  providers: [AcademicYearService],
  exports: [AcademicYearService],
})
export class AcademicYearModule {}
