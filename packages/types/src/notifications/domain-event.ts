export type AggregateType = 'bond' | 'transfer' | 'report';

export interface DomainEvent<TPayload = Record<string, unknown>> {
  id: string;
  aggregateType: AggregateType;
  aggregateId: string;
  eventType: string; // e.g. 'bond.frozen', 'transfer.accepted', 'report.submitted'
  payload: TPayload;
  occurredAt: string; // ISO-8601
  dedupKey: string;
}
