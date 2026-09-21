import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CompanyUserController } from './company-user.controller';
import { CompanyUserService } from './company-user.service';

@Module({
  imports: [AuthModule],
  controllers: [CompanyUserController],
  providers: [CompanyUserService],
  exports: [CompanyUserService],
})
export class CompanyUserModule {}
