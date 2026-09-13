import { IsString, MinLength, IsNotEmpty, IsEmail, IsEnum } from "class-validator";
import 

export class RegisterDto {
 @IsString()
   @IsNotEmpty()
   fullName: string;
 
   @IsEmail()
   email: string;
 
   @IsString()
   @IsNotEmpty()
   username: string;
 
   @IsString()
   @IsNotEmpty()
   @MinLength(8)
   password: string;
 
   @IsString()
   @IsNotEmpty()
   phone: string;
 
   @IsEnum(SchoolUserRole)
   role: SchoolUserRole;
}