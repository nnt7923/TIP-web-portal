import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LookupsController } from './lookups.controller';
import { LookupsService } from './lookups.service';

@Module({
  imports: [AuthModule],
  controllers: [LookupsController],
  providers: [LookupsService],
})
export class LookupsModule {}
