import type { PayloadSigner } from '../domain/signer.interface';

/** Used when no signing secret is configured. */
export class NoopPayloadSigner implements PayloadSigner {
  sign(_payload: string): string {
    return '';
  }
}
