import { createHmac } from 'crypto';
import type { PayloadSigner } from '../domain/signer.interface';

export class HmacPayloadSigner implements PayloadSigner {
  constructor(private readonly secret: string) {}

  sign(payload: string): string {
    return createHmac('sha256', this.secret).update(payload).digest('hex');
  }
}
