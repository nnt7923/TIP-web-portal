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
import { CompanyUserRole } from '@prisma/client';
import { CompanyRoles } from '../../common/decorators/company-roles.decorator';
import {
  CurrentUser,
  type CurrentUserData,
} from '../../common/decorators/current-user.decorator';
import { CompanyRolesGuard } from '../auth/guards/company-roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth-guard';
import { CompanyUserService } from './company-user.service';
import { ApproveCompanyUserDto } from './dto/approve-company-user.dto';
import { CreateCompanyUserDto } from './dto/create-company-user.dto';
import { QueryCompanyUserDto } from './dto/query-company-user.dto';
import { UpdateCompanyUserProfileDto } from './dto/update-company-user-profile.dto';
import { UpdateCompanyUserDto } from './dto/update-company-user.dto';

@ApiTags('Company Users')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, CompanyRolesGuard)
@CompanyRoles(CompanyUserRole.COMPANY_ADMIN)
@Controller('company-users')
export class CompanyUserController {
  constructor(private readonly companyUserService: CompanyUserService) {}

  @Post()
  @ApiOperation({
    summary: 'Admin: create a pending company user in the permitted company',
  })
  create(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreateCompanyUserDto,
  ) {
    return this.companyUserService.create(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Admin: list company users in the permitted scope' })
  findAll(
    @CurrentUser() user: CurrentUserData,
    @Query() query: QueryCompanyUserDto,
  ) {
    return this.companyUserService.findAll(user, query);
  }

  @Get('company/:companyId')
  @ApiOperation({ summary: 'Admin: list users of one permitted company' })
  findAllInCompany(
    @CurrentUser() user: CurrentUserData,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Query() query: QueryCompanyUserDto,
  ) {
    return this.companyUserService.findAllInCompany(user, companyId, query);
  }

  @Get('me')
  @CompanyRoles(CompanyUserRole.COMPANY_ADMIN, CompanyUserRole.STAFF)
  @ApiOperation({ summary: 'Company user: get my own profile' })
  findMe(@CurrentUser() user: CurrentUserData) {
    return this.companyUserService.findMe(user);
  }

  @Patch('me')
  @CompanyRoles(CompanyUserRole.COMPANY_ADMIN, CompanyUserRole.STAFF)
  @ApiOperation({ summary: 'Company user: update my name and phone' })
  updateMe(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: UpdateCompanyUserProfileDto,
  ) {
    return this.companyUserService.updateMe(user, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Admin: get one company user' })
  findOne(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.companyUserService.findOne(user, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Admin: update a company user' })
  update(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCompanyUserDto,
  ) {
    return this.companyUserService.update(user, id, dto);
  }

  @Patch(':id/approval')
  @ApiOperation({ summary: 'Admin: approve a pending company user' })
  approve(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveCompanyUserDto,
  ) {
    return this.companyUserService.approve(user, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Admin: remove a company profile, preserving the global Account',
  })
  async remove(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.companyUserService.remove(user, id);
  }
}
