import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SchoolUserController } from './schooluser.controller';
import { SchoolUserService } from './schooluser.service';

@Module({
  imports: [AuthModule],
  controllers: [SchoolUserController],
  providers: [SchoolUserService],
  exports: [SchoolUserService],
})
export class SchoolUserModule {}
