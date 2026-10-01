import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OpportunityController } from './opportunity.controller';
import { OpportunityService } from './opportunity.service';
import { PublicOpportunityController } from './public-opportunity.controller';

@Module({
  imports: [AuthModule],
  controllers: [OpportunityController, PublicOpportunityController],
  providers: [OpportunityService],
  exports: [OpportunityService],
})
export class OpportunityModule {}
