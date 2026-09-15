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
import { CreateMajorDto } from './dto/create-major.dto';
import { QueryMajorDto } from './dto/query-major.dto';
import { UpdateMajorDto } from './dto/update-major.dto';
import { MajorService } from './major.service';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth-guard';
import { SchoolRoles } from '../../common/decorators/school-roles.decorator';
import { SchoolRolesGuard } from '../auth/guards/school-roles.guard';
import { SchoolUserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentUserData } from '../../common/decorators/current-user.decorator';

@ApiTags('Majors')
@Controller('majors')
export class MajorController {
  constructor(private readonly majorService: MajorService) {}

  @Post()
  @UseGuards(JwtAuthGuard, SchoolRolesGuard)
  @SchoolRoles(SchoolUserRole.UNIVERSITY_ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a major' })
  @ApiConsumes('application/json')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name', 'code'],
      properties: {
        name: { type: 'string' },
        code: { type: 'string' },
      },
    },
  })
  create(
    @CurrentUser() currentUser: CurrentUserData,
    @Body() createMajorDto: CreateMajorDto,
  ) {
    return this.majorService.create(currentUser, createMajorDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get and filter universities' })
  findAll(@Query() query: QueryMajorDto) {
    return this.majorService.findAll(query);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, SchoolRolesGuard)
  @SchoolRoles(SchoolUserRole.UNIVERSITY_ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update a major ' })
  @ApiConsumes('application/json')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        code: { type: 'string' },
      },
    },
  })
  update(
    @CurrentUser() currentUser: CurrentUserData,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateMajorDto: UpdateMajorDto,
  ) {
    return this.majorService.update(currentUser, id, updateMajorDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, SchoolRolesGuard)
  @SchoolRoles(SchoolUserRole.UNIVERSITY_ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete a major' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() currentUser: CurrentUserData,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.majorService.remove(currentUser, id);
  }
}
