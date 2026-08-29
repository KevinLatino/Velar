import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { ExplorerService } from './explorer.service';

/**
 * Endpoints PÚBLICOS (sin auth) para el explorador del ledger de VELAR.
 * Cualquiera puede consultarlos para verificar el estado on-chain.
 */
@ApiTags('explorer')
@Public()
@Controller('explorer')
export class ExplorerController {
  constructor(private explorer: ExplorerService) {}

  @Get('snapshot')
  snapshot(@Query('page') page: string | undefined, @Query('limit') limit: string | undefined) {
    return this.explorer.snapshot(page, limit);
  }

  @Get('search')
  search(@Query('q') q: string | undefined) {
    return this.explorer.search(q ?? '');
  }

  @Get('bonds/:bondId')
  bondDetail(@Param('bondId') bondId: string) {
    return this.explorer.findBondDetail(bondId);
  }
}
