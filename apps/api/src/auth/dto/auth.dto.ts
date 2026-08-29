import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import type { LoginInput, Perspectiva, RegisterInput } from '../auth.service';

export class LoginDto implements LoginInput {
  @ApiProperty({ example: 'comprador@velar.cr' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Velar12345!' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'comprador@velar.cr' })
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'token_hash del enlace de recuperación' })
  @IsString()
  @IsNotEmpty()
  tokenHash!: string;

  @ApiProperty({ minLength: 8, example: 'Velar12345!' })
  @IsString()
  @MinLength(8)
  password!: string;
}

export class ChangeEmailDto {
  @ApiProperty({ example: 'nuevo@velar.cr' })
  @IsEmail()
  email!: string;
}

export class RegisterDto implements RegisterInput {
  @ApiProperty({ example: 'nuevo@velar.cr' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8, example: 'Velar12345!' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ enum: ['usuario', 'partido'] })
  @IsIn(['usuario', 'partido'])
  perspectiva!: Perspectiva;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nombres?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  apellidos?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  identificacion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  telefono?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  direccion?: string;

  @ApiPropertyOptional({ description: 'Requerido si perspectiva = partido' })
  @IsOptional()
  @IsString()
  nombrePartido?: string;

  @ApiPropertyOptional({ description: 'Requerido si perspectiva = partido' })
  @IsOptional()
  @IsString()
  codigo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  representanteLegal?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cedulaJuridica?: string;
}
