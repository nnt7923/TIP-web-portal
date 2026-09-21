import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PlacementCompanyAdminGuard } from './guards/placement-company-admin.guard';
import { PlacementController } from './placement.controller';
import { PlacementService } from './placement.service';

@Module({
  imports: [AuthModule],
  controllers: [PlacementController],
  providers: [PlacementService, PlacementCompanyAdminGuard],
  exports: [PlacementService],
})
export class PlacementModule {}
