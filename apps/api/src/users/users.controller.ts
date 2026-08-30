import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { Role } from '@velar/types';
import { UpdateWalletDto } from './dto/users.dto';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(private users: UsersService) {}

  @Get('me')
  getMe(@CurrentUser() user: any) { return this.users.getProfile(user.id); }

  @Patch('me')
  updateMe(@CurrentUser() user: any, @Body() body: { full_name?: string }) {
    return this.users.updateProfile(user.id, body);
  }

  /** Vincula la wallet self-custody (Freighter) del usuario a su perfil. */
  @Patch('me/wallet')
  setMyWallet(@CurrentUser() user: any, @Body() body: UpdateWalletDto) {
    return this.users.setSelfCustodyWallet(user.id, body.publicKey);
  }

  @Get()
  listAll(@CurrentUser() user: any) { return this.users.listUsers(user.profile?.role as Role); }

  @Get('recompradores')
  listRecipients(@CurrentUser() user: any) {
    return this.users.listRecipients(user.id, user.profile?.role as Role);
  }

  @Patch(':id/role')
  setRole(@Param('id') id: string, @Body() body: { role: Role }, @CurrentUser() user: any) {
    return this.users.setRole(id, body.role, user.profile?.role as Role);
  }

  /** Desactiva una cuenta (admin). Bloquea el login hasta reactivarla. */
  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string, @CurrentUser() user: any) {
    return this.users.deactivate(id, user.profile?.role as Role, user.id);
  }

  /** Reactiva una cuenta desactivada (admin). */
  @Patch(':id/reactivate')
  reactivate(@Param('id') id: string, @CurrentUser() user: any) {
    return this.users.reactivate(id, user.profile?.role as Role, user.id);
  }

  /** Reintenta la wallet custodial fallida de un usuario (admin). */
  @Post(':id/wallet/retry')
  @Roles('admin')
  retryWallet(@Param('id') id: string, @CurrentUser() user: any) {
    return this.users.retryWallet(id, user.profile?.role as Role, user.id);
  }
}
