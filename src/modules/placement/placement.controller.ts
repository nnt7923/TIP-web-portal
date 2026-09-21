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
import {
  CurrentUser,
  type CurrentUserData,
} from '../../common/decorators/current-user.decorator';
import { SchoolRoles } from '../../common/decorators/school-roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth-guard';
import { SchoolRolesGuard } from '../auth/guards/school-roles.guard';
import { AssignCompanySupervisorDto } from './dto/assign-company-supervisor.dto';
import { ConfirmPlacementDto } from './dto/confirm-placement.dto';
import { CreatePlacementDto } from './dto/create-placement.dto';
import { QueryPlacementDto } from './dto/query-placement.dto';
import { UpdatePlacementDto } from './dto/update-placement.dto';
import { UpdatePlacementStatusDto } from './dto/update-placement-status.dto';
import { PlacementCompanyAdminGuard } from './guards/placement-company-admin.guard';
import { placementSchoolRoles } from './placement.policy';
import { PlacementService } from './placement.service';

@ApiTags('Placements')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('placements')
export class PlacementController {
  constructor(private readonly placementService: PlacementService) {}

  /** Trường tạo placement trực tiếp hoặc từ đơn ứng tuyển đã được chấp nhận. */
  @Post()
  @UseGuards(SchoolRolesGuard)
  @SchoolRoles(...placementSchoolRoles)
  @ApiOperation({
    summary: 'University Admin/Staff: create a PENDING placement',
  })
  @ApiConsumes('application/json')
  @ApiBody({ type: CreatePlacementDto })
  create(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreatePlacementDto,
  ) {
    return this.placementService.create(user, dto);
  }

  /** Danh sách tự giới hạn theo quyền và hồ sơ của người đăng nhập. */
  @Get()
  @ApiOperation({
    summary: 'List and filter placements within your permitted scope',
  })
  findAll(
    @CurrentUser() user: CurrentUserData,
    @Query() query: QueryPlacementDto,
  ) {
    return this.placementService.findAll(user, query);
  }

  /** Xem chi tiết trong phạm vi được phép. */
  @Get(':id')
  @ApiOperation({ summary: 'Get a placement within your permitted scope' })
  findOne(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.placementService.findOne(user, id);
  }

  /** Trường sửa nội dung PENDING hoặc đổi người hướng dẫn trường trước khi kết thúc. */
  @Patch(':id')
  @UseGuards(SchoolRolesGuard)
  @SchoolRoles(...placementSchoolRoles)
  @ApiOperation({
    summary:
      'University Admin/Staff: update placement details or university supervisor',
  })
  @ApiConsumes('application/json')
  @ApiBody({ type: UpdatePlacementDto })
  update(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePlacementDto,
  ) {
    return this.placementService.update(user, id, dto);
  }

  /** Công ty xác nhận tiếp nhận, dùng guard không cho System Admin bypass. */
  @Patch(':id/confirm')
  @UseGuards(PlacementCompanyAdminGuard)
  @ApiOperation({
    summary: 'Company Admin: confirm a placement in your company',
  })
  @ApiConsumes('application/json')
  @ApiBody({ type: ConfirmPlacementDto })
  confirm(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmPlacementDto,
  ) {
    return this.placementService.confirm(user, id, dto);
  }

  /** Công ty phân công hoặc gỡ người hướng dẫn công ty. */
  @Patch(':id/company-supervisor')
  @UseGuards(PlacementCompanyAdminGuard)
  @ApiOperation({
    summary: 'Company Admin: assign or unassign your company supervisor',
  })
  @ApiConsumes('application/json')
  @ApiBody({ type: AssignCompanySupervisorDto })
  assignCompanySupervisor(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignCompanySupervisorDto,
  ) {
    return this.placementService.assignCompanySupervisor(user, id, dto);
  }

  /** Trường bắt đầu, hoàn thành hoặc hủy placement; dữ liệu được giữ để truy vết. */
  @Patch(':id/status')
  @UseGuards(SchoolRolesGuard)
  @SchoolRoles(...placementSchoolRoles)
  @ApiOperation({
    summary: 'University Admin/Staff: start, complete or cancel a placement',
  })
  @ApiConsumes('application/json')
  @ApiBody({ type: UpdatePlacementStatusDto })
  updateStatus(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePlacementStatusDto,
  ) {
    return this.placementService.updateStatus(user, id, dto);
  }
}
