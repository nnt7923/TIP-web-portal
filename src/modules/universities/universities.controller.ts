import {
  MAX_UPLOAD_BYTES,
  UPLOAD_VALIDATOR_OPTIONS,
} from '../../common/upload-limits';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
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
  UseInterceptors,
  UploadedFile,
  ParseFilePipeBuilder,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { GlobalRole, UniversityStatus } from '@prisma/client';
import { GlobalRoles } from '../../common/decorators/global-roles.decorator';
import { GlobalRolesGuard } from '../auth/guards/global-roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth-guard';
import { CreateUniversityDto } from './dto/create-university.dto';
import { QueryUniversityDto } from './dto/query-university.dto';
import { UpdateUniversityDto } from './dto/update-university.dto';
import { UniversitiesService } from './universities.service';

const logoUpload = FileInterceptor('logo', {
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
});
const optionalLogoPipe = new ParseFilePipeBuilder()
  .addFileTypeValidator({ fileType: /(jpg|jpeg|png|webp)$/ })
  .addMaxSizeValidator(UPLOAD_VALIDATOR_OPTIONS)
  .build({ fileIsRequired: false });

type UploadedLogoFile = { buffer: Buffer };

@ApiTags('Universities')
@Controller('universities')
export class UniversitiesController {
  constructor(private readonly universitiesService: UniversitiesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, GlobalRolesGuard)
  @GlobalRoles(GlobalRole.SYSTEM_ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a university' })
  @UseInterceptors(logoUpload)
  @ApiConsumes('application/json', 'multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name', 'code'],
      properties: {
        name: { type: 'string', example: 'TIP University' },
        code: { type: 'string', example: 'TIP' },
        website: { type: 'string', format: 'uri', nullable: true },
        address: { type: 'string', nullable: true },
        logoUrl: { type: 'string', nullable: true },
        logo: {
          type: 'string',
          format: 'binary',
          description:
            'JPG, PNG or WebP, maximum 4 MiB; takes precedence over logoUrl.',
        },
      },
    },
  })
  create(
    @Body() createUniversityDto: CreateUniversityDto,
    @UploadedFile(optionalLogoPipe) file?: UploadedLogoFile,
  ) {
    return this.universitiesService.create(createUniversityDto, file);
  }

  @Get()
  @ApiOperation({ summary: 'Get and filter universities' })
  findAll(@Query() query: QueryUniversityDto) {
    return this.universitiesService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a university by id' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.universitiesService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, GlobalRolesGuard)
  @GlobalRoles(GlobalRole.SYSTEM_ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update a university' })
  @UseInterceptors(logoUpload)
  @ApiConsumes('application/json', 'multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        code: { type: 'string' },
        website: { type: 'string', format: 'uri' },
        address: { type: 'string' },
        logoUrl: {
          type: 'string',
          description: 'Send an empty string to remove the logo.',
        },
        status: { type: 'string', enum: Object.values(UniversityStatus) },
        logo: {
          type: 'string',
          format: 'binary',
          description:
            'JPG, PNG or WebP, maximum 4 MiB; takes precedence over logoUrl.',
        },
      },
    },
  })
  update(
    @CurrentUser('id') actorId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateUniversityDto: UpdateUniversityDto,
    @UploadedFile(optionalLogoPipe) file?: UploadedLogoFile,
  ) {
    return this.universitiesService.update(
      actorId,
      id,
      updateUniversityDto,
      file,
    );
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, GlobalRolesGuard)
  @GlobalRoles(GlobalRole.SYSTEM_ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete a university' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.universitiesService.remove(id);
  }
}
