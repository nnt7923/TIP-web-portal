import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseFilePipeBuilder,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CompanyStatus, GlobalRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { GlobalRoles } from '../../common/decorators/global-roles.decorator';
import { GlobalRolesGuard } from '../auth/guards/global-roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth-guard';
import { CompanyService } from './company.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { QueryCompanyDto } from './dto/query-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

type UploadedLogoFile = { buffer: Buffer };

const logoUpload = FileInterceptor('logo', {
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

const optionalLogoPipe = new ParseFilePipeBuilder()
  .addFileTypeValidator({ fileType: /(jpg|jpeg|png|webp)$/ })
  .addMaxSizeValidator({ maxSize: 5 * 1024 * 1024 })
  .build({ fileIsRequired: false });

@ApiTags('Companies')
@Controller('companies')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Post()
  @UseGuards(JwtAuthGuard, GlobalRolesGuard)
  @GlobalRoles(GlobalRole.SYSTEM_ADMIN)
  @ApiBearerAuth('access-token')
  @UseInterceptors(logoUpload)
  @ApiOperation({ summary: 'System Admin: create a company' })
  @ApiConsumes('application/json', 'multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', example: 'TIP Technology' },
        website: { type: 'string', format: 'uri' },
        address: { type: 'string' },
        industry: { type: 'string', example: 'Information Technology' },
        logoUrl: { type: 'string', format: 'uri' },
        logo: {
          type: 'string',
          format: 'binary',
          description: 'Optional JPG, PNG or WebP image; maximum 5 MB.',
        },
      },
    },
  })
  create(
    @CurrentUser('id') actorId: string,
    @Body() dto: CreateCompanyDto,
    @UploadedFile(optionalLogoPipe) file?: UploadedLogoFile,
  ) {
    return this.companyService.create(actorId, dto, file);
  }

  @Get()
  @ApiOperation({ summary: 'Get and filter companies' })
  findAll(@Query() query: QueryCompanyDto) {
    return this.companyService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a company by id' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.companyService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, GlobalRolesGuard)
  @GlobalRoles(GlobalRole.SYSTEM_ADMIN)
  @ApiBearerAuth('access-token')
  @UseInterceptors(logoUpload)
  @ApiOperation({ summary: 'System Admin: update a company' })
  @ApiConsumes('application/json', 'multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        website: { type: 'string', format: 'uri' },
        address: { type: 'string' },
        industry: { type: 'string' },
        logoUrl: {
          type: 'string',
          description: 'External logo URL; send an empty string to remove it.',
        },
        logo: {
          type: 'string',
          format: 'binary',
          description: 'Replacement JPG, PNG or WebP; maximum 5 MB.',
        },
        status: { type: 'string', enum: Object.values(CompanyStatus) },
      },
    },
  })
  update(
    @CurrentUser('id') actorId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCompanyDto,
    @UploadedFile(optionalLogoPipe) file?: UploadedLogoFile,
  ) {
    return this.companyService.update(actorId, id, dto, file);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, GlobalRolesGuard)
  @GlobalRoles(GlobalRole.SYSTEM_ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'System Admin: delete a company' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser('id') actorId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.companyService.remove(actorId, id);
  }
}
