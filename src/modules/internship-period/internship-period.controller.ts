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
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth-guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentUserData } from '../../common/decorators/current-user.decorator';
import { SchoolRoles } from '../../common/decorators/school-roles.decorator';
import { SchoolRolesGuard } from '../auth/guards/school-roles.guard';
import { SchoolUserRole } from '@prisma/client';
import { InternshipPeriodService } from './internship-period.service';
import { InternshipPeriodStatus } from '@prisma/client';
import { CreateInternShipPeriodDto } from './dto/create-internship-period.dto';
import { UpdateInternShipPeriodDto } from './dto/update-internship-period.dto';
import { QueryInternShipPeriodDto } from './dto/query-internship-period.dto';

@ApiTags('Internship Period')
@Controller('internship-period')
export class InternshipPeriodController {
  constructor(
    private readonly internshipPeriodService: InternshipPeriodService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, SchoolRolesGuard)
  @SchoolRoles(SchoolUserRole.UNIVERSITY_ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a internship period' })
  @ApiConsumes('application/json')
  @ApiBody({
    schema: {
      type: 'object',
      required: [
        'academicYearId',
        'name',
        'periodNumber',
        'startDate',
        'endDate',
        'applyStartDate',
        'applyEndDate',
        'requiredHours',
        'requiredWeeks',
      ],
      properties: {
        academicYearId: {
          type: 'string',
          format: 'uuid',
        },
        name: { type: 'string' },
        startDate: {
          type: 'string',
          format: 'date-time',
          example: '2026-09-01T00:00:00.000Z',
        },
        periodNumber: { type: 'number' },
        endDate: {
          type: 'string',
          format: 'date-time',
          example: '2027-06-30T23:59:59.000Z',
        },
        applyStartDate: {
          type: 'string',
          format: 'date-time',
          example: '2026-09-01T00:00:00.000Z',
        },
        applyEndDate: {
          type: 'string',
          format: 'date-time',
          example: '2027-06-30T23:59:59.000Z',
        },
        requiredHours: { type: 'number' },
        requiredWeeks: { type: 'number' },
        status: {
          type: 'string',
          enum: Object.values(InternshipPeriodStatus),
          default: InternshipPeriodStatus.DRAFT,
        },
      },
    },
  })
  create(
    @CurrentUser() currentUser: CurrentUserData,
    @Body() dto: CreateInternShipPeriodDto,
  ) {
    return this.internshipPeriodService.create(currentUser, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get and filter internship period' })
  findAll(
    @CurrentUser() currentUser: CurrentUserData,
    @Query() query: QueryInternShipPeriodDto,
  ) {
    return this.internshipPeriodService.findAll(currentUser, query);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get an internship period by id' })
  findOne(
    @CurrentUser() currentUser: CurrentUserData,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.internshipPeriodService.findOne(currentUser, id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, SchoolRolesGuard)
  @SchoolRoles(SchoolUserRole.UNIVERSITY_ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update internship period' })
  @ApiConsumes('application/json')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        academicYearId: {
          type: 'string',
          format: 'uuid',
        },
        name: { type: 'string' },
        startDate: {
          type: 'string',
          format: 'date-time',
          example: '2026-09-01T00:00:00.000Z',
        },
        periodNumber: { type: 'number' },
        endDate: {
          type: 'string',
          format: 'date-time',
          example: '2027-06-30T23:59:59.000Z',
        },
        applyStartDate: {
          type: 'string',
          format: 'date-time',
          example: '2026-09-01T00:00:00.000Z',
        },
        applyEndDate: {
          type: 'string',
          format: 'date-time',
          example: '2027-06-30T23:59:59.000Z',
        },
        requiredHours: { type: 'number' },
        requiredWeeks: { type: 'number' },
        status: {
          type: 'string',
          enum: Object.values(InternshipPeriodStatus),
          default: InternshipPeriodStatus.DRAFT,
        },
      },
    },
  })
  update(
    @CurrentUser() currentUser: CurrentUserData,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateInternShipPeriodDto,
  ) {
    return this.internshipPeriodService.update(currentUser, id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, SchoolRolesGuard)
  @SchoolRoles(SchoolUserRole.UNIVERSITY_ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete a internship period' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() currentUser: CurrentUserData,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.internshipPeriodService.remove(currentUser, id);
  }
}
