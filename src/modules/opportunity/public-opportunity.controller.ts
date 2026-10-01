import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { QueryPublicOpportunityDto } from './dto/query-public-opportunity.dto';
import { OpportunityService } from './opportunity.service';

@ApiTags('Public Opportunities')
@Controller('public/opportunities')
export class PublicOpportunityController {
  constructor(private readonly opportunityService: OpportunityService) {}

  @Get()
  @ApiOperation({
    summary: 'Browse open opportunities from verified companies',
  })
  findAll(@Query() query: QueryPublicOpportunityDto) {
    return this.opportunityService.findPublic(query);
  }
}
