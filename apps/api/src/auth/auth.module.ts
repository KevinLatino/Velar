import { Module, forwardRef } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { AuthAccountController, AuthController } from './auth.controller';
import { EscrowModule } from '../escrow/escrow.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  // forwardRef: AuditModule ya importa AuthModule (ciclo Auth → Escrow → Audit → Auth).
  imports: [EscrowModule, forwardRef(() => AuditModule)],
  providers: [AuthGuard, AuthService],
  controllers: [AuthController, AuthAccountController],
  exports: [AuthGuard],
})
export class AuthModule {}
