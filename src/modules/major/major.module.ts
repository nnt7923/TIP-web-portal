import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MajorController } from './major.controller';
import { MajorService } from './major.service';

@Module({
  imports: [AuthModule],
  controllers: [MajorController],
  providers: [MajorService],
  exports: [MajorService],
})
export class MajorModule {}
