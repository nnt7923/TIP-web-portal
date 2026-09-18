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
import { SchoolUserRole, StudentStatus } from '@prisma/client';
import {
  CurrentUser,
  type CurrentUserData,
} from '../../common/decorators/current-user.decorator';
import { SchoolRoles } from '../../common/decorators/school-roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth-guard';
import { SchoolRolesGuard } from '../auth/guards/school-roles.guard';
import { CreateStudentDto } from './dto/create-student.dto';
import { QueryStudentDto } from './dto/query-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { StudentService } from './student.service';
import { UpdateStudentProfileDto } from './dto/update-student-profile.dto';

type UploadedCvFile = {
  buffer: Buffer;
};

const schoolReaderRoles = [
  SchoolUserRole.UNIVERSITY_ADMIN,
  SchoolUserRole.UNIVERSITY_SUPERVISOR,
  SchoolUserRole.STAFF,
];

@ApiTags('Students')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, SchoolRolesGuard)
@Controller('students')
export class StudentController {
  constructor(private readonly studentService: StudentService) {}

  @Post()
  @SchoolRoles(SchoolUserRole.UNIVERSITY_ADMIN)
  @UseInterceptors(
    FileInterceptor('cv', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }),
  )
  @ApiOperation({ summary: 'Create a student' })
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody({
    schema: {
      type: 'object',
      required: [
        'fullName',
        'username',
        'email',
        'password',
        'majorId',
        'studentCode',
        'semester',
        'className',
      ],
      properties: {
        fullName: { type: 'string' },
        username: { type: 'string' },
        email: { type: 'string', format: 'email' },
        password: { type: 'string', format: 'password', minLength: 8 },
        phone: { type: 'string' },
        majorId: { type: 'string', format: 'uuid' },
        studentCode: { type: 'string', example: 'STU001' },
        semester: { type: 'integer', minimum: 1, maximum: 8 },
        className: { type: 'string', example: 'SE1801' },
        cvUrl: {
          type: 'string',
          nullable: true,
          description: 'External CV URL; an uploaded file takes precedence.',
        },
        cv: {
          type: 'string',
          format: 'binary',
          description: 'Optional PDF CV, maximum 5 MB.',
        },
      },
    },
  })
  create(
    @CurrentUser() currentUser: CurrentUserData,
    @Body() dto: CreateStudentDto,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({ fileType: 'application/pdf' })
        .addMaxSizeValidator({ maxSize: 5 * 1024 * 1024 })
        .build({ fileIsRequired: false }),
    )
    file?: UploadedCvFile,
  ) {
    return this.studentService.create(currentUser, dto, file);
  }

  @Get()
  @SchoolRoles(...schoolReaderRoles)
  @ApiOperation({
    summary: 'Get and filter students in the current university',
  })
  findAll(
    @CurrentUser() currentUser: CurrentUserData,
    @Query() query: QueryStudentDto,
  ) {
    return this.studentService.findAll(currentUser, query);
  }

  @Get('me')
  @ApiOperation({ summary: 'Student: get my own profile' })
  findMe(@CurrentUser() user: CurrentUserData) {
    return this.studentService.findMe(user);
  }

  @Patch('me')
  @UseInterceptors(
    FileInterceptor('cv', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }),
  )
  @ApiOperation({ summary: 'Student: update my name, phone and CV' })
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        fullName: { type: 'string' },
        phone: { type: 'string' },
        cvUrl: { type: 'string' },
        cv: {
          type: 'string',
          format: 'binary',
          description: 'PDF, maximum 5 MB',
        },
      },
    },
  })
  updateMe(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: UpdateStudentProfileDto,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({ fileType: 'application/pdf' })
        .addMaxSizeValidator({ maxSize: 5 * 1024 * 1024 })
        .build({ fileIsRequired: false }),
    )
    file?: UploadedCvFile,
  ) {
    return this.studentService.updateMe(user, dto, file);
  }

  @Get(':id')
  @SchoolRoles(...schoolReaderRoles)
  @ApiOperation({ summary: 'Get a student by id' })
  findOne(
    @CurrentUser() currentUser: CurrentUserData,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.studentService.findOne(currentUser, id);
  }

  @Patch(':id')
  @SchoolRoles(SchoolUserRole.UNIVERSITY_ADMIN)
  @UseInterceptors(
    FileInterceptor('cv', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }),
  )
  @ApiOperation({ summary: 'Update a student' })
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        majorId: { type: 'string', format: 'uuid' },
        studentCode: { type: 'string' },
        semester: { type: 'integer', minimum: 1, maximum: 8 },
        className: { type: 'string' },
        cvUrl: {
          type: 'string',
          description:
            'External CV URL. Send an empty value to remove the current CV.',
        },
        cv: {
          type: 'string',
          format: 'binary',
          description: 'Optional replacement PDF CV, maximum 5 MB.',
        },
        status: {
          type: 'string',
          enum: Object.values(StudentStatus),
        },
      },
    },
  })
  update(
    @CurrentUser() currentUser: CurrentUserData,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateStudentDto,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({ fileType: 'application/pdf' })
        .addMaxSizeValidator({ maxSize: 5 * 1024 * 1024 })
        .build({ fileIsRequired: false }),
    )
    file?: UploadedCvFile,
  ) {
    return this.studentService.update(currentUser, id, dto, file);
  }

  @Delete(':id')
  @SchoolRoles(SchoolUserRole.UNIVERSITY_ADMIN)
  @ApiOperation({
    summary: 'Delete a student profile, preserving the global Account',
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() currentUser: CurrentUserData,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.studentService.remove(currentUser, id);
  }
}
