import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { SupabaseService } from '../common/supabase/supabase.service';
import { WalletService } from '../escrow/wallet.service';
import { HORIZON_URL, SOROBAN_RPC_URL } from '../escrow/stellar.config';

const TIMEOUT_MS = 3000;
const DEFAULT_MIN_BALANCE_XLM = 5;

type UpDown = 'up' | 'down';
type WalletCheckStatus = 'ok' | 'degraded' | 'down' | 'unconfigured';

export type WalletCheck = {
  status: WalletCheckStatus;
  label: 'platform' | 'escrow';
  address?: string;
  balanceXlm?: number;
  minBalanceXlm?: number;
  error?: string;
};

@Injectable()
export class HealthService {
  private readonly startTime = Date.now();
  private readonly minBalanceXlm =
    Number(process.env.ESCROW_MIN_XLM_BALANCE) || DEFAULT_MIN_BALANCE_XLM;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly wallets: WalletService,
  ) {}

  /** Liveness: el proceso responde. Sin llamadas externas, siempre rápido. */
  liveness() {
    return {
      status: 'ok' as const,
      uptime: this.uptimeSeconds(),
      ...this.buildInfo(),
    };
  }

  /** Readiness: Supabase, Horizon, Soroban RPC y fondeo de wallets, cada uno independiente. */
  async check() {
    const [supabaseStatus, stellarStatus, sorobanStatus, platformWallet, escrowWallet] =
      await Promise.all([
        this.checkSupabase(),
        this.checkStellar(),
        this.checkSoroban(),
        this.checkWalletBalance('platform', this.wallets.platformAddress),
        this.checkWalletBalance('escrow', this.wallets.escrowAddress),
      ]);

    const criticalDown =
      supabaseStatus === 'down' ||
      stellarStatus === 'down' ||
      sorobanStatus === 'down' ||
      platformWallet.status === 'down' ||
      escrowWallet.status === 'down';
    const anyDegraded = platformWallet.status === 'degraded' || escrowWallet.status === 'degraded';

    const status = criticalDown ? 'down' : anyDegraded ? 'degraded' : 'ok';

    const body = {
      status,
      supabase: supabaseStatus,
      stellar: stellarStatus,
      soroban: sorobanStatus,
      wallets: { platform: platformWallet, escrow: escrowWallet },
      uptime: this.uptimeSeconds(),
      ...this.buildInfo(),
    };

    if (status === 'down') {
      throw new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE);
    }

    return body;
  }

  private uptimeSeconds(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  /** Info de build/deploy para debugging on-call. No requiere paso de build extra. */
  private buildInfo() {
    return {
      version: process.env.npm_package_version ?? 'unknown',
      commit:
        process.env.GIT_COMMIT_SHA ??
        process.env.VERCEL_GIT_COMMIT_SHA ??
        process.env.RENDER_GIT_COMMIT ??
        'unknown',
      deployedAt: process.env.DEPLOYED_AT ?? new Date(this.startTime).toISOString(),
    };
  }

  private async checkSupabase(): Promise<UpDown> {
    try {
      const { error } = (await Promise.race([
        this.supabase.admin.from('bonds').select('*', { count: 'exact', head: true }),
        this.timeout(),
      ])) as { error: unknown };
      return error ? 'down' : 'up';
    } catch {
      return 'down';
    }
  }

  private async checkStellar(): Promise<UpDown> {
    try {
      const res = (await Promise.race([fetch(`${HORIZON_URL}/`), this.timeout()])) as Response;
      return res.ok ? 'up' : 'down';
    } catch {
      return 'down';
    }
  }

  /** Chequea el RPC de Soroban (contratos), distinto del Horizon clásico. */
  private async checkSoroban(): Promise<UpDown> {
    try {
      const res = (await Promise.race([
        fetch(SOROBAN_RPC_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' }),
        }),
        this.timeout(),
      ])) as Response;
      if (!res.ok) return 'down';
      const json = (await res.json()) as { result?: { status?: string } };
      return json?.result?.status === 'healthy' ? 'up' : 'down';
    } catch {
      return 'down';
    }
  }

  /**
   * Balance nativo (XLM) de una wallet de plataforma/escrow. Si no hay dirección
   * configurada (dev/test sin credenciales VELAR) se reporta 'unconfigured' en vez
   * de fallar: no es un incidente, es un entorno sin custodia provisionada.
   */
  private async checkWalletBalance(
    label: 'platform' | 'escrow',
    address: string | undefined,
  ): Promise<WalletCheck> {
    if (!address) {
      return { status: 'unconfigured', label };
    }
    try {
      const res = (await Promise.race([
        fetch(`${HORIZON_URL}/accounts/${address}`),
        this.timeout(),
      ])) as Response;
      if (!res.ok) {
        return { status: 'down', label, address, error: `horizon ${res.status}` };
      }
      const account = (await res.json()) as {
        balances?: { asset_type?: string; balance?: string }[];
      };
      const native = account.balances?.find((b) => b.asset_type === 'native');
      const balanceXlm = native ? parseFloat(native.balance ?? '0') : 0;
      const status: WalletCheckStatus = balanceXlm < this.minBalanceXlm ? 'degraded' : 'ok';
      return { status, label, address, balanceXlm, minBalanceXlm: this.minBalanceXlm };
    } catch (e) {
      return { status: 'down', label, address, error: (e as Error).message };
    }
  }

  private timeout(): Promise<never> {
    return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS));
  }
}
