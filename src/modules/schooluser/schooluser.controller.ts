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
import { CreateSchoolUserDto } from './dto/create-schooluser';
import { QuerySchoolUserDto } from './dto/query-schooluser';
import { UpdateSchoolUserDto } from './dto/update-schooluser';
import { SchoolUserService } from './schooluser.service';

@ApiTags('SchoolUsers')
@Controller('schoolusers')
export class SchoolUserController {
  constructor(private readonly schoolUserService: SchoolUserService) { }

  @Post()
  @ApiOperation({ summary: 'Create a school user' })
  @ApiConsumes('application/json')
  @ApiBody({
    schema: {
      type: 'object',
      required: [
        'universityId',
        'fullName',
        'username',
        'email',
        'password',
        'phone',
        'role',
      ],
      properties: {
        universityId: {
          type: 'string',
          format: 'uuid',
        },
        fullName: { type: 'string' },
        username: { type: 'string' },
        email: { type: 'string', format: 'email' },
        password: { type: 'string', format: 'password' },
        phone: { type: 'string' },
        role: {
          type: 'string',
          enum: ['STAFF', 'UNIVERSITY_SUPERVISOR'],
        },
      },
    },
  })
  create(@Body() createSchoolUserDto: CreateSchoolUserDto) {
    return this.schoolUserService.create(createSchoolUserDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get and filter school users' })
  findAll(@Query() query: QuerySchoolUserDto) {
    return this.schoolUserService.findAll(query);
  }

  @Get('university/:universityId')
  @ApiOperation({ summary: 'Get and filter school users by university' })
  findAllSchoolUsers(
    @Param('universityId', new ParseUUIDPipe()) universityId: string,
    @Query() query: QuerySchoolUserDto
  ) {
    return this.schoolUserService.findAllSchoolUsers(universityId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a school user by id' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.schoolUserService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a school user' })
  @ApiConsumes('application/json')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        fullName: { type: 'string' },
        username: { type: 'string' },
        email: { type: 'string', format: 'email' },
        password: { type: 'string', format: 'password' },
        phone: { type: 'string' },
        role: {
          type: 'string',
          enum: ['STAFF', 'UNIVERSITY_SUPERVISOR'],
        },
      },
    },
  })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateSchoolUserDto: UpdateSchoolUserDto,
  ) {
    return this.schoolUserService.update(id, updateSchoolUserDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a school user' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.schoolUserService.remove(id);
  }
}
