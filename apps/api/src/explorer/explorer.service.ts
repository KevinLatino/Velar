import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../common/supabase/supabase.service';
import {
  EXPLORER_NETWORK,
  explorerAccountUrl,
  explorerAssetUrl,
  explorerContractUrl,
} from '../escrow/stellar.config';
import { WalletService } from '../escrow/wallet.service';
import { paginatedResponse, parsePagination } from '../common/pagination';

const SEARCH_RESULT_LIMIT = 50;

/**
 * Lógica del explorador público del ledger de VELAR (sin auth). Cualquiera
 * puede consultarla para verificar el estado on-chain.
 */
@Injectable()
export class ExplorerService {
  constructor(
    private supabase: SupabaseService,
    private wallets: WalletService,
  ) {}

  async snapshot(page?: string, limit?: string) {
    const db = this.supabase.admin;
    const { page: p, limit: l, from, to } = parsePagination(page, limit);
    const issuer = this.wallets.platformAddress ?? '';
    const escrow = this.wallets.escrowAddress ?? '';

    const [
      bondsPageRes,
      bondsCountRes,
      allBondsRes,
      liberadasRes,
      sorobanPageRes,
      sorobanCountRes,
      twPageRes,
      twCountRes,
    ] = await Promise.all([
      db.from('bonds').select('bond_id, status, face_value, currency, soroban_contract_id, created_at, parties(name)').order('created_at', { ascending: false }).range(from, to),
      db.from('bonds').select('bond_id', { count: 'exact', head: true }),
      db.from('bonds').select('face_value'),
      db.from('transfers').select('amount').eq('status', 'liberada'),
      db.from('bonds').select('soroban_contract_id, bond_id').not('soroban_contract_id', 'is', null).order('created_at', { ascending: false }).range(from, to),
      db.from('bonds').select('bond_id', { count: 'exact', head: true }).not('soroban_contract_id', 'is', null),
      db.from('transfers').select('escrow_contract_id, id, status, bonds(bond_id)').not('escrow_contract_id', 'is', null).order('created_at', { ascending: false }).range(from, to),
      db.from('transfers').select('id', { count: 'exact', head: true }).not('escrow_contract_id', 'is', null),
    ]);

    const bonds = bondsPageRes.data ?? [];
    const allBonds = allBondsRes.data ?? [];
    const liberadas = liberadasRes.data ?? [];
    const totalVolume = liberadas.reduce((s: number, t: any) => s + (Number(t.amount) || 0), 0);
    const totalEmitted = allBonds.reduce((s: number, b: any) => s + (Number(b.face_value) || 0), 0);

    return {
      network: EXPLORER_NETWORK,

      // Accounts críticas
      platform_account: {
        address: issuer,
        explorer_url: explorerAccountUrl(issuer),
      },
      escrow_account: {
        address: escrow,
        explorer_url: explorerAccountUrl(escrow),
      },

      // Assets emitidos por la plataforma
      assets: {
        vcrc: {
          symbol: 'VCRC',
          issuer,
          purpose: 'Representación on-chain del precio de cada venta en colones',
          explorer_url: explorerAssetUrl('VCRC', issuer),
        },
      },

      // Resumen (conteos reales sobre toda la tabla, no solo la página actual)
      stats: {
        total_bonds: bondsCountRes.count ?? 0,
        total_emitted_crc: totalEmitted,
        total_sales: liberadas.length,
        total_volume_crc: totalVolume,
        sorobanContracts: sorobanCountRes.count ?? 0,
        trustlessWorkContracts: twCountRes.count ?? 0,
      },

      // Bonos (con link al asset y al contrato Soroban si tienen), paginado.
      recent_bonds: paginatedResponse(
        bonds.map((b: any) => ({
          bond_id: b.bond_id,
          party: b.parties?.name,
          face_value: b.face_value,
          currency: b.currency ?? 'CRC',
          status: b.status,
          asset_url: explorerAssetUrl(assetCode(b.bond_id), issuer),
          soroban_contract_url: b.soroban_contract_id
            ? explorerContractUrl(b.soroban_contract_id)
            : null,
          soroban_contract_id: b.soroban_contract_id,
        })),
        bondsCountRes.count ?? 0,
        p,
        l,
      ),

      // Contratos Soroban VelarBond (NFT del bono), paginado.
      soroban_nfts: paginatedResponse(
        (sorobanPageRes.data ?? []).map((b: any) => ({
          bond_id: b.bond_id,
          contract_id: b.soroban_contract_id,
          url: explorerContractUrl(b.soroban_contract_id),
        })),
        sorobanCountRes.count ?? 0,
        p,
        l,
      ),

      // Contratos Trustless Work (escrow de coordinación), paginado.
      trustless_work_contracts: paginatedResponse(
        (twPageRes.data ?? []).map((t: any) => ({
          transfer_id: t.id,
          bond_id: t.bonds?.bond_id,
          status: t.status,
          contract_id: t.escrow_contract_id,
          url: explorerContractUrl(t.escrow_contract_id),
        })),
        twCountRes.count ?? 0,
        p,
        l,
      ),

      // Glosario de memos para que cualquiera entienda las txs
      memo_glossary: [
        { prefix: 'VELAR:issue:', meaning: 'Emisión inicial de un bono al partido emisor' },
        { prefix: 'escrow:', meaning: 'Token del bono bloqueado en escrow durante una venta' },
        { prefix: 'sold:', meaning: 'Token liberado al comprador + monto pagado en CRC' },
        { prefix: 'return:', meaning: 'Bono devuelto al dueño original (cancelación TSE)' },
        { prefix: 'bond:', meaning: 'Pago de VCRC vinculado a una venta específica' },
      ],
    };
  }

  /** Detalle completo de un bono: partido, dueño, historial de transferencias y contratos on-chain. */
  async findBondDetail(bondId: string) {
    const db = this.supabase.admin;
    const issuer = this.wallets.platformAddress ?? '';

    const { data: bond, error } = await db
      .from('bonds')
      .select(
        'token_id, bond_id, status, face_value, currency, document_hash, soroban_contract_id, created_at, updated_at, ' +
          'parties(name, code, stellar_wallet), profiles!bonds_current_owner_fkey(id, full_name, email, stellar_wallet)',
      )
      .eq('bond_id', bondId)
      .maybeSingle();

    if (error || !bond) throw new NotFoundException(`Bono ${bondId} no encontrado`);
    const b = bond as any;

    const { data: transfersData } = await db
      .from('transfers')
      .select(
        'id, status, amount, escrow_contract_id, payment_evidence_hash, created_at, updated_at, ' +
          'from_profile:profiles!transfers_from_owner_fkey(id, full_name, email), ' +
          'to_profile:profiles!transfers_to_owner_fkey(id, full_name, email)',
      )
      .eq('bond_token_id', b.token_id)
      .order('created_at', { ascending: true });

    const transfers = transfersData ?? [];

    const trustlessWorkContracts = transfers
      .filter((t: any) => t.escrow_contract_id)
      .map((t: any) => ({
        transfer_id: t.id,
        status: t.status,
        contract_id: t.escrow_contract_id,
        url: explorerContractUrl(t.escrow_contract_id),
      }));

    return {
      bond_id: b.bond_id,
      status: b.status,
      face_value: b.face_value,
      currency: b.currency ?? 'CRC',
      document_hash: b.document_hash,
      created_at: b.created_at,
      updated_at: b.updated_at,
      party: b.parties
        ? { name: b.parties.name, code: b.parties.code, wallet: b.parties.stellar_wallet ?? null }
        : null,
      current_owner: b.profiles
        ? { id: b.profiles.id, name: b.profiles.full_name, email: b.profiles.email, wallet: b.profiles.stellar_wallet ?? null }
        : null,
      asset_url: explorerAssetUrl(assetCode(b.bond_id), issuer),
      soroban_contract_id: b.soroban_contract_id,
      soroban_contract_url: b.soroban_contract_id ? explorerContractUrl(b.soroban_contract_id) : null,
      trustless_work_contracts: trustlessWorkContracts,
      transfers: transfers.map((t: any) => ({
        id: t.id,
        status: t.status,
        amount: t.amount,
        from: t.from_profile ? { id: t.from_profile.id, name: t.from_profile.full_name } : null,
        to: t.to_profile ? { id: t.to_profile.id, name: t.to_profile.full_name } : null,
        escrow_contract_id: t.escrow_contract_id,
        escrow_contract_url: t.escrow_contract_id ? explorerContractUrl(t.escrow_contract_id) : null,
        created_at: t.created_at,
        updated_at: t.updated_at,
      })),
    };
  }

  /** Busca bonos por bond_id, nombre de partido o wallet Stellar (del partido o del dueño actual). */
  async search(q: string) {
    const query = (q ?? '').trim();
    if (!query) throw new BadRequestException('El parámetro q es requerido');

    const db = this.supabase.admin;
    const like = `%${query}%`;
    const issuer = this.wallets.platformAddress ?? '';
    const bondColumns = 'bond_id, status, face_value, currency, soroban_contract_id, created_at, parties(name)';

    const [byBondId, partiesByName, partiesByWallet, profilesByWallet] = await Promise.all([
      db.from('bonds').select(bondColumns).ilike('bond_id', like).limit(SEARCH_RESULT_LIMIT),
      db.from('parties').select('id').ilike('name', like),
      db.from('parties').select('id').ilike('stellar_wallet', like),
      db.from('profiles').select('id').or(`stellar_wallet.ilike.${like},stellar_public_key.ilike.${like}`),
    ]);

    const partyIds = [
      ...new Set([...(partiesByName.data ?? []), ...(partiesByWallet.data ?? [])].map((p: any) => p.id)),
    ];
    const ownerIds = [...new Set((profilesByWallet.data ?? []).map((p: any) => p.id))];

    const [byParty, byOwner] = await Promise.all([
      partyIds.length
        ? db.from('bonds').select(bondColumns).in('issuer_party_id', partyIds).limit(SEARCH_RESULT_LIMIT)
        : Promise.resolve({ data: [] as any[] }),
      ownerIds.length
        ? db.from('bonds').select(bondColumns).in('current_owner', ownerIds).limit(SEARCH_RESULT_LIMIT)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const merged = new Map<string, any>();
    for (const row of [...(byBondId.data ?? []), ...(byParty.data ?? []), ...(byOwner.data ?? [])]) {
      merged.set(row.bond_id, row);
    }

    const results = [...merged.values()].map((b: any) => ({
      bond_id: b.bond_id,
      party: b.parties?.name ?? null,
      face_value: b.face_value,
      currency: b.currency ?? 'CRC',
      status: b.status,
      asset_url: explorerAssetUrl(assetCode(b.bond_id), issuer),
      soroban_contract_url: b.soroban_contract_id ? explorerContractUrl(b.soroban_contract_id) : null,
      soroban_contract_id: b.soroban_contract_id,
    }));

    return { query, count: results.length, results };
  }
}

function assetCode(bondId: string): string {
  const code = bondId.replace(/[^A-Za-z0-9]/g, '').slice(0, 12);
  return code || 'BOND';
}
