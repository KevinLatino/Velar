import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { HealthService } from './health.service';

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /** Liveness: el proceso responde. Sin dependencias externas. */
  @Get('live')
  live() {
    return this.healthService.liveness();
  }

  /** Readiness: Supabase, Horizon, Soroban RPC y fondeo de wallets. */
  @Get()
  async check() {
    return this.healthService.check();
  }
}
