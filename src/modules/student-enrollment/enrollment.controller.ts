import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type CurrentUserData,
} from '../../common/decorators/current-user.decorator';
import { SchoolRoles } from '../../common/decorators/school-roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth-guard';
import { SchoolRolesGuard } from '../auth/guards/school-roles.guard';
import {
  CreateEnrollmentDto,
  EnrollmentQueryDto,
  ReviewEnrollmentDto,
} from './enrollment.dto';
import { EnrollmentService } from './enrollment.service';

@ApiTags('Student enrollment')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('student-enrollments')
export class EnrollmentController {
  constructor(private readonly service: EnrollmentService) {}
  @Get('universities') universities(@Query() query: EnrollmentQueryDto) {
    return this.service.universities(query);
  }
  @Get('universities/:id/majors') majors(
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.majors(id);
  }
  @Get('me') mine(@CurrentUser() user: CurrentUserData) {
    return this.service.mine(user);
  }
  @Post() submit(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreateEnrollmentDto,
  ) {
    return this.service.submit(user, dto);
  }
  @Patch(':id/cancel') cancel(
    @CurrentUser() user: CurrentUserData,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.cancel(user, id);
  }
  @Get()
  @UseGuards(SchoolRolesGuard)
  @SchoolRoles('UNIVERSITY_ADMIN')
  list(
    @CurrentUser() user: CurrentUserData,
    @Query() query: EnrollmentQueryDto,
  ) {
    return this.service.list(user, query);
  }
  @Patch(':id/review')
  @UseGuards(SchoolRolesGuard)
  @SchoolRoles('UNIVERSITY_ADMIN')
  review(
    @CurrentUser() user: CurrentUserData,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReviewEnrollmentDto,
  ) {
    return this.service.review(user, id, dto);
  }
}
