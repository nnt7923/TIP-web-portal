import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GlobalRole } from '@prisma/client';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { GlobalRoles } from '../../common/decorators/global-roles.decorator';
import { GlobalRolesGuard } from '../auth/guards/global-roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth-guard';
import { QueryUniversityDto } from '../universities/dto/query-university.dto';
import { QueryAccountDto } from './dto/query-account.dto';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';
import { UpdateAccountStatusDto } from './dto/update-account-status.dto';
import { UpdateUniversityStatusDto } from './dto/update-university-status.dto';
import { SystemAdminService } from './system-admin.service';

@ApiTags('System Admin')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, GlobalRolesGuard)
@GlobalRoles(GlobalRole.SYSTEM_ADMIN)
@Controller('system-admin')
export class SystemAdminController {
  constructor(private readonly systemAdminService: SystemAdminService) {}

  @Get('accounts')
  @ApiOperation({ summary: 'List and filter every account in the system' })
  findAllAccounts(@Query() query: QueryAccountDto) {
    return this.systemAdminService.findAllAccounts(query);
  }

  @Get('accounts/:id')
  @ApiOperation({ summary: 'Get one account' })
  findOneAccount(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.systemAdminService.findOneAccount(id);
  }

  @Patch('accounts/:id/status')
  @ApiOperation({ summary: 'Lock, unlock, or change an account status' })
  updateAccountStatus(
    @CurrentUser('id') actorId: string,
    @Param('id', new ParseUUIDPipe()) accountId: string,
    @Body() dto: UpdateAccountStatusDto,
    @Req() request: Request,
  ) {
    return this.systemAdminService.updateAccountStatus(
      actorId,
      accountId,
      dto,
      request.ip,
    );
  }

  @Post('accounts/:id/logout-all')
  @ApiOperation({ summary: 'Revoke every active session of an account' })
  logoutAccount(
    @CurrentUser('id') actorId: string,
    @Param('id', new ParseUUIDPipe()) accountId: string,
    @Req() request: Request,
  ) {
    return this.systemAdminService.logoutAccount(
      actorId,
      accountId,
      request.ip,
    );
  }

  @Post('accounts/:id/university-approval')
  @ApiOperation({
    summary:
      'Approve a new university and its registered administrator together',
  })
  approveUniversityRegistration(
    @CurrentUser('id') actorId: string,
    @Param('id', new ParseUUIDPipe()) accountId: string,
    @Req() request: Request,
  ) {
    return this.systemAdminService.approveUniversityRegistration(
      actorId,
      accountId,
      request.ip,
    );
  }

  @Get('universities')
  @ApiOperation({ summary: 'List and filter universities' })
  findAllUniversities(@Query() query: QueryUniversityDto) {
    return this.systemAdminService.findAllUniversities(query);
  }

  @Patch('universities/:id/status')
  @ApiOperation({ summary: 'Verify, suspend, or deactivate a university' })
  updateUniversityStatus(
    @CurrentUser('id') actorId: string,
    @Param('id', new ParseUUIDPipe()) universityId: string,
    @Body() dto: UpdateUniversityStatusDto,
    @Req() request: Request,
  ) {
    return this.systemAdminService.updateUniversityStatus(
      actorId,
      universityId,
      dto,
      request.ip,
    );
  }

  @Get('audit-logs')
  @ApiOperation({ summary: 'View system administration audit logs' })
  findAuditLogs(@Query() query: QueryAuditLogDto) {
    return this.systemAdminService.findAuditLogs(query);
  }
}
