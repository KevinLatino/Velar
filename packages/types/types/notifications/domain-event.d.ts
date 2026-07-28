export type AggregateType = 'bond' | 'transfer' | 'report';
export interface DomainEvent<TPayload = Record<string, unknown>> {
    id: string;
    aggregateType: AggregateType;
    aggregateId: string;
    eventType: string;
    payload: TPayload;
    occurredAt: string;
    dedupKey: string;
}
