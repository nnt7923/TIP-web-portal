import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  CompanyUserRole,
  OpportunityStatus,
  OpportunityType,
} from '@prisma/client';
import { CompanyRoles } from '../../common/decorators/company-roles.decorator';
import {
  CurrentUser,
  type CurrentUserData,
} from '../../common/decorators/current-user.decorator';
import { CompanyRolesGuard } from '../auth/guards/company-roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth-guard';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { QueryOpportunityDto } from './dto/query-opportunity.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import { OpportunityService } from './opportunity.service';

const opportunityBodySchema = {
  type: 'object',
  properties: {
    title: { type: 'string', example: 'Backend Developer Intern' },
    type: { type: 'string', enum: Object.values(OpportunityType) },
    description: { type: 'string' },
    location: { type: 'string', nullable: true },
    vacancies: { type: 'integer', minimum: 1, nullable: true },
    applicationDeadline: {
      type: 'string',
      format: 'date-time',
      nullable: true,
      example: '2026-12-31T23:59:59.000Z',
    },
    status: {
      type: 'string',
      enum: Object.values(OpportunityStatus),
      default: OpportunityStatus.DRAFT,
    },
  },
};

@ApiTags('Opportunities')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('opportunities')
export class OpportunityController {
  constructor(private readonly opportunityService: OpportunityService) {}

  @Post()
  @UseGuards(CompanyRolesGuard)
  @CompanyRoles(CompanyUserRole.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Company Admin: create an opportunity' })
  @ApiConsumes('application/json')
  @ApiBody({
    schema: {
      ...opportunityBodySchema,
      required: ['title', 'type', 'description'],
    },
  })
  create(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreateOpportunityDto,
  ) {
    return this.opportunityService.create(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List opportunities of the current company' })
  findAll(
    @CurrentUser() user: CurrentUserData,
    @Query() query: QueryOpportunityDto,
  ) {
    return this.opportunityService.findAll(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an opportunity of the current company' })
  findOne(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.opportunityService.findOne(user, id);
  }

  @Patch(':id')
  @UseGuards(CompanyRolesGuard)
  @CompanyRoles(CompanyUserRole.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Company Admin: update an opportunity' })
  @ApiConsumes('application/json')
  @ApiBody({ schema: opportunityBodySchema })
  update(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOpportunityDto,
  ) {
    return this.opportunityService.update(user, id, dto);
  }

  @Delete(':id')
  @UseGuards(CompanyRolesGuard)
  @CompanyRoles(CompanyUserRole.COMPANY_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Company Admin: delete an opportunity' })
  async remove(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.opportunityService.remove(user, id);
  }
}
