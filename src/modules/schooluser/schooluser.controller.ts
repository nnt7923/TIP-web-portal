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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentUserData } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth-guard';
import { ApproveSchoolUserDto } from './dto/approve-schooluser.dto';
import { CreateSchoolUserDto } from './dto/create-schooluser';
import { QuerySchoolUserDto } from './dto/query-schooluser';
import { UpdateSchoolUserDto } from './dto/update-schooluser';
import { SchoolUserService } from './schooluser.service';

@ApiTags('SchoolUsers')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('schoolusers')
export class SchoolUserController {
  constructor(private readonly service: SchoolUserService) {}

  @Post()
  @ApiOperation({
    summary: 'Admin: create a school user in the permitted university',
  })
  create(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreateSchoolUserDto,
  ) {
    return this.service.create(user, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Admin: list school users within the permitted scope',
  })
  findAll(
    @CurrentUser() user: CurrentUserData,
    @Query() query: QuerySchoolUserDto,
  ) {
    return this.service.findAll(user, query);
  }

  @Get('university/:universityId')
  findAllSchoolUsers(
    @CurrentUser() user: CurrentUserData,
    @Param('universityId', ParseUUIDPipe) universityId: string,
    @Query() query: QuerySchoolUserDto,
  ) {
    return this.service.findAllSchoolUsers(user, universityId, query);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.findOne(user, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSchoolUserDto,
  ) {
    return this.service.update(user, id, dto);
  }

  @Patch(':id/approval')
  approve(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveSchoolUserDto,
  ) {
    return this.service.approve(user, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Admin: remove a school profile, preserving the global Account',
  })
  async remove(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.service.remove(user, id);
  }
}
