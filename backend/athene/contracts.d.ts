/** Public contracts; runtime validation lives in routes.js and gemini.js. IDs are existing string IDs. */
export interface Citation {
  sourceId: string; projectId?: string; documentId: string; chunkId: string; filename: string;
  page: number | null; section: string | null; score: number;
}
export interface EvidenceStatement {
  text: string; person: string | null;
  attribution: 'documented' | 'ambiguous' | 'not_applicable';
  evidence: { sourceId: string; quote: string }[];
}
export interface AtheneAnswer {
  projectId: string; answer: string; statements: EvidenceStatement[]; citations: Citation[];
  insufficientEvidence: boolean; conflictingEvidence: boolean; reviewRequired: boolean;
  retrieval: { engine: 'mongodb-atlas-vector-search'; retrievedChunks: number };
}
export interface AtheneDocument {
  id: string; projectId: string; uploaderId: string; filename: string; mimeType: string;
  size: number; contentHash: string; uploadedAt: string;
  status: 'pending' | 'processing' | 'ready' | 'failed'; retryable: boolean;
  error: { code: string; message: string } | null; chunkCount: number;
  processedAt?: string; failedAt?: string; leaseUntil?: string;
  embeddingModel?: string; dimensions?: number; profile?: string;
  warnings?: string[]; sections?: { page: number | null; section: string | null }[];
}
export interface AtheneEnvelope<T> { data: T; meta: { mode: 'atlas'; fictional: false; feature: 'athene' } }
export interface QueryRequest { question: string }
export interface ContributionQueryRequest { person?: string; question?: string }
