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
import { SchoolUserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentUserData } from '../../common/decorators/current-user.decorator';
import { SchoolRoles } from '../../common/decorators/school-roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth-guard';
import { SchoolRolesGuard } from '../auth/guards/school-roles.guard';
import { ApproveSchoolUserDto } from './dto/approve-schooluser.dto';
import { CreateSchoolUserDto } from './dto/create-schooluser';
import { QuerySchoolUserDto } from './dto/query-schooluser';
import { UpdateSchoolUserDto } from './dto/update-schooluser';
import { SchoolUserService } from './schooluser.service';

@ApiTags('SchoolUsers')
@Controller('schoolusers')
export class SchoolUserController {
  constructor(private readonly schoolUserService: SchoolUserService) {}

  @Post()
  @ApiOperation({ summary: 'Create a school user' })
  @ApiConsumes('application/json')
  @ApiBody({
    schema: {
      type: 'object',
      required: [
        'universityId',
        'fullName',
        'username',
        'email',
        'password',
        'phone',
        'role',
      ],
      properties: {
        universityId: {
          type: 'string',
          format: 'uuid',
        },
        fullName: { type: 'string' },
        username: { type: 'string' },
        email: { type: 'string', format: 'email' },
        password: { type: 'string', format: 'password' },
        phone: { type: 'string' },
        role: {
          type: 'string',
          enum: ['STAFF', 'UNIVERSITY_SUPERVISOR'],
        },
      },
    },
  })
  create(@Body() createSchoolUserDto: CreateSchoolUserDto) {
    return this.schoolUserService.create(createSchoolUserDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get and filter school users' })
  findAll(@Query() query: QuerySchoolUserDto) {
    return this.schoolUserService.findAll(query);
  }

  @Get('university/:universityId')
  @ApiOperation({ summary: 'Get and filter school users by university' })
  findAllSchoolUsers(
    @Param('universityId', new ParseUUIDPipe()) universityId: string,
    @Query() query: QuerySchoolUserDto,
  ) {
    return this.schoolUserService.findAllSchoolUsers(universityId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a school user by id' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.schoolUserService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a school user' })
  @ApiConsumes('application/json')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        fullName: { type: 'string' },
        username: { type: 'string' },
        email: { type: 'string', format: 'email' },
        password: { type: 'string', format: 'password' },
        phone: { type: 'string' },
        role: {
          type: 'string',
          enum: ['STAFF', 'UNIVERSITY_SUPERVISOR'],
        },
      },
    },
  })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateSchoolUserDto: UpdateSchoolUserDto,
  ) {
    return this.schoolUserService.update(id, updateSchoolUserDto);
  }

  @Patch(':id/approval')
  @UseGuards(JwtAuthGuard, SchoolRolesGuard)
  @SchoolRoles(SchoolUserRole.UNIVERSITY_ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Approve a school user in the same university' })
  approve(
    @CurrentUser() currentUser: CurrentUserData,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ApproveSchoolUserDto,
  ) {
    return this.schoolUserService.approve(currentUser, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a school user' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.schoolUserService.remove(id);
  }
}
