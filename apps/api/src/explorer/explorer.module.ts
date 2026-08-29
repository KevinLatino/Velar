import { Module } from '@nestjs/common';
import { ExplorerController } from './explorer.controller';
import { ExplorerService } from './explorer.service';
import { SupabaseModule } from '../common/supabase/supabase.module';
import { EscrowModule } from '../escrow/escrow.module';

@Module({
  imports: [SupabaseModule, EscrowModule],
  controllers: [ExplorerController],
  providers: [ExplorerService],
})
export class ExplorerModule {}
