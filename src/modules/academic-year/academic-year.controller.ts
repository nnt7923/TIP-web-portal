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
import { CreateAcademicYearDto } from './dto/create-academic-year.dto';
import { QueryAcademicYearDto } from './dto/query-academic-year.dto';
import { UpdateAcademicYearDto } from './dto/update-academic-year.dto';
import { AcademicYearService } from './academic-year.service';
import { AcademicYearStatus } from '@prisma/client';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth-guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentUserData } from '../../common/decorators/current-user.decorator';
import { SchoolRoles } from '../../common/decorators/school-roles.decorator';
import { SchoolRolesGuard } from '../auth/guards/school-roles.guard';
import { SchoolUserRole } from '@prisma/client';

@ApiTags('Academic Years')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@Controller('academic-years')
export class AcademicYearController {
  constructor(private readonly academicYearService: AcademicYearService) {}

  @Post()
  @UseGuards(JwtAuthGuard, SchoolRolesGuard)
  @SchoolRoles(SchoolUserRole.UNIVERSITY_ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create an academic year' })
  @ApiConsumes('application/json')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name', 'startDate', 'endDate'],
      properties: {
        name: { type: 'string' },
        startDate: {
          type: 'string',
          format: 'date-time',
          example: '2026-09-01T00:00:00.000Z',
        },
        endDate: {
          type: 'string',
          format: 'date-time',
          example: '2027-06-30T23:59:59.000Z',
        },
        status: {
          type: 'string',
          enum: Object.values(AcademicYearStatus),
          default: AcademicYearStatus.ACTIVE,
        },
      },
    },
  })
  create(
    @CurrentUser() currentUser: CurrentUserData,
    @Body() dto: CreateAcademicYearDto,
  ) {
    return this.academicYearService.create(currentUser, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get and filter academic year' })
  findAll(
    @CurrentUser() currentUser: CurrentUserData,
    @Query() query: QueryAcademicYearDto,
  ) {
    return this.academicYearService.findAll(currentUser, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an academic year by id' })
  findOne(
    @CurrentUser() currentUser: CurrentUserData,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.academicYearService.findOne(currentUser, id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, SchoolRolesGuard)
  @SchoolRoles(SchoolUserRole.UNIVERSITY_ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update academic year' })
  @ApiConsumes('application/json')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        startDate: {
          type: 'string',
          format: 'date-time',
          example: '2026-09-01T00:00:00.000Z',
        },
        endDate: {
          type: 'string',
          format: 'date-time',
          example: '2027-06-30T23:59:59.000Z',
        },
        status: {
          type: 'string',
          enum: Object.values(AcademicYearStatus),
          default: AcademicYearStatus.ACTIVE,
        },
      },
    },
  })
  update(
    @CurrentUser() currentUser: CurrentUserData,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateAcademicYearDto,
  ) {
    return this.academicYearService.update(currentUser, id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, SchoolRolesGuard)
  @SchoolRoles(SchoolUserRole.UNIVERSITY_ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete a academic year' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() currentUser: CurrentUserData,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.academicYearService.remove(currentUser, id);
  }
}
