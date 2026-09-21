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
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CompanyUserRole } from '@prisma/client';
import { CompanyRoles } from '../../common/decorators/company-roles.decorator';
import {
  CurrentUser,
  type CurrentUserData,
} from '../../common/decorators/current-user.decorator';
import { CompanyRolesGuard } from '../auth/guards/company-roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth-guard';
import { ApplicationService } from './application.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { QueryApplicationDto } from './dto/query-application.dto';
import { UpdateApplicationStatusDto } from './dto/update-application-status.dto';

@ApiTags('Applications')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('applications')
export class ApplicationController {
  constructor(private readonly applicationService: ApplicationService) {}

  /** Nhận opportunityId; service lấy hồ sơ sinh viên từ CurrentUser. */
  @Post()
  @ApiOperation({ summary: 'Student: apply for an open opportunity' })
  @ApiConsumes('application/json')
  @ApiBody({ type: CreateApplicationDto })
  create(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreateApplicationDto,
  ) {
    return this.applicationService.create(user, dto);
  }

  /** Danh sách có phân trang, tự giới hạn theo sinh viên, trường hoặc công ty. */
  @Get()
  @ApiOperation({
    summary: 'List and filter applications within your permitted scope',
  })
  findAll(
    @CurrentUser() user: CurrentUserData,
    @Query() query: QueryApplicationDto,
  ) {
    return this.applicationService.findAll(user, query);
  }

  /** Xem chi tiết một đơn trong phạm vi được phép. */
  @Get(':id')
  @ApiOperation({ summary: 'Get an application within your permitted scope' })
  findOne(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.applicationService.findOne(user, id);
  }

  /** Công ty hoặc System Admin duyệt đơn; guard kiểm tra role, service kiểm tra phạm vi. */
  @Patch(':id/status')
  @UseGuards(CompanyRolesGuard)
  @CompanyRoles(CompanyUserRole.COMPANY_ADMIN)
  @ApiOperation({
    summary:
      'Company Admin/System Admin: review, accept or reject an application',
  })
  @ApiConsumes('application/json')
  @ApiBody({ type: UpdateApplicationStatusDto })
  updateStatus(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateApplicationStatusDto,
  ) {
    return this.applicationService.updateStatus(user, id, dto);
  }

  /** Sinh viên rút đơn đang chờ xử lý của chính mình. */
  @Patch(':id/withdraw')
  @ApiOperation({
    summary: 'Student: withdraw my PENDING or REVIEWING application',
  })
  withdraw(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.applicationService.withdraw(user, id);
  }
}
