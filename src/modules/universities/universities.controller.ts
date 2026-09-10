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
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UniversityStatus } from '@prisma/client';
import { CreateUniversityDto } from './dto/create-university.dto';
import { QueryUniversityDto } from './dto/query-university.dto';
import { UpdateUniversityDto } from './dto/update-university.dto';
import { UniversitiesService } from './universities.service';

@ApiTags('Universities')
@Controller('universities')
export class UniversitiesController {
  constructor(private readonly universitiesService: UniversitiesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a university' })
  @ApiConsumes('application/json')
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
      },
    },
  })
  create(@Body() createUniversityDto: CreateUniversityDto) {
    return this.universitiesService.create(createUniversityDto);
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
  @ApiOperation({ summary: 'Update a university' })
  @ApiConsumes('application/json')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        code: { type: 'string' },
        website: { type: 'string', format: 'uri', nullable: true },
        address: { type: 'string', nullable: true },
        logoUrl: { type: 'string', nullable: true },
        status: { type: 'string', enum: Object.values(UniversityStatus) },
      },
    },
  })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateUniversityDto: UpdateUniversityDto,
  ) {
    return this.universitiesService.update(id, updateUniversityDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a university' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.universitiesService.remove(id);
  }
}
