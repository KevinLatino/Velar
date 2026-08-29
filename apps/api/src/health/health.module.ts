import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { EscrowModule } from '../escrow/escrow.module';

@Module({
  imports: [EscrowModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
