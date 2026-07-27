export interface PayloadSigner {
  sign(payload: string): string;
}
