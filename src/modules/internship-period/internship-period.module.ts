import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InternshipPeriodController } from './internship-period.controller';
import { InternshipPeriodService } from './internship-period.service';

@Module({
  imports: [AuthModule],
  controllers: [InternshipPeriodController],
  providers: [InternshipPeriodService],
  exports: [InternshipPeriodService],
})
export class InternshipPeriodModule {}
