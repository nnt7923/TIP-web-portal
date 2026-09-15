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
import { CreateMajorDto } from './dto/create-major.dto';
import { QueryMajorDto } from './dto/query-major.dto';
import { UpdateMajorDto } from './dto/update-major.dto';
import { MajorService } from './major.service';

@ApiTags('Majors')
@Controller('majors')
export class MajorController {
  constructor(private readonly majorService: MajorService) {}

  @Post()
  @ApiOperation({ summary: 'Create a major' })
  @ApiConsumes('application/json')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['universityId', 'name', 'code'],
      properties: {
        universityId: {
          type: 'string',
          format: 'uuid',
        },
        name: { type: 'string' },
        code: { type: 'string' },
      },
    },
  })
  create(@Body() createMajorDto: CreateMajorDto) {
    return this.majorService.create(createMajorDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get and filter universities' })
  findAll(@Query() query: QueryMajorDto) {
    return this.majorService.findAll(query);
  }

  @Patch(':id')
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
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateMajorDto: UpdateMajorDto,
  ) {
    return this.majorService.update(id, updateMajorDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a major' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.majorService.remove(id);
  }
}
