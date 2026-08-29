import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { WalletReconciliationService } from './wallet-reconciliation.service';
import { AuthModule } from '../auth/auth.module';
import { EscrowModule } from '../escrow/escrow.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuthModule, EscrowModule, AuditModule],
  providers: [UsersService, WalletReconciliationService],
  controllers: [UsersController],
  exports: [UsersService, WalletReconciliationService],
})
export class UsersModule {}
