/**
 * Pipeline & Opportunity domain types — CRM-native entities (Source of Truth:
 * the CRM platform). These are defined separately to keep types/index.ts
 * under the per-file line limit.
 */

/** A pipeline stage as exposed by the CRM opportunities API. */
export interface PipelineStageInfo {
  id: string;
  name: string;
  position: number;
}

/** A pipeline (kanban board) with its ordered stages. CRM-native entity. */
export interface Pipeline {
  id: string;
  name: string;
  stages: PipelineStageInfo[];
}

/** An opportunity (deal) on a pipeline. CRM-native entity. */
export interface Opportunity {
  id: string;
  name: string;
  pipelineId: string;
  pipelineStageId: string;
  status: "open" | "won" | "lost" | "abandoned";
  contactId: string;
  contactName: string;
  monetaryValue: number;
  assignedTo: string | null;
  /** Epoch ms, or `null` when the CRM returned no parseable date. */
  createdAt: number | null;
  /** Epoch ms, or `null` when the CRM returned no parseable date. */
  updatedAt: number | null;
}

/** Paginated opportunities result. */
export interface PaginatedOpportunities {
  data: Opportunity[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
