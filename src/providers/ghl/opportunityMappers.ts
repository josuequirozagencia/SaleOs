/**
 * server/src/providers/ghl/opportunityMappers.ts
 *
 * Mappers for GoHighLevel Opportunities and Pipelines. The domain types are
 * the shared ones from ../../types (re-exported here for convenience).
 */
import type { Opportunity, Pipeline, PipelineStageInfo } from "../../types";
import { parseEpochMs } from "./mappers";
export type { Opportunity, Pipeline, PipelineStageInfo };

export function mapCrmPipeline(raw: any): Pipeline {
  const stages = Array.isArray(raw.stages)
    ? raw.stages.map((s: any, idx: number) => ({
        id: String(s.id || s._id || `stage_${idx}`),
        name: String(s.name || s.title || `Etapa ${idx + 1}`),
        position: typeof s.position === "number" ? s.position : idx,
      }))
    : [];

  return {
    id: String(raw.id || raw._id || ""),
    name: String(raw.name || "Pipeline"),
    stages,
  };
}

export function mapCrmOpportunity(raw: any): Opportunity {
  const contactName =
    raw.contact?.name ||
    [raw.contact?.firstName, raw.contact?.lastName].filter(Boolean).join(" ") ||
    raw.contactName ||
    "Contacto";

  let status: Opportunity["status"] = "open";
  const rawStatus = String(raw.status || "").toLowerCase();
  if (["won", "lost", "abandoned"].includes(rawStatus)) {
    status = rawStatus as Opportunity["status"];
  }

  return {
    id: String(raw.id || raw._id || ""),
    name: String(raw.name || raw.title || "Oportunidad"),
    pipelineId: String(raw.pipelineId || ""),
    pipelineStageId: String(raw.pipelineStageId || raw.stageId || ""),
    status,
    contactId: String(raw.contactId || raw.contact?.id || ""),
    contactName,
    monetaryValue: typeof raw.monetaryValue === "number" ? raw.monetaryValue : 0,
    assignedTo: raw.assignedTo ? String(raw.assignedTo) : null,
    // Same rule as every other CRM date: never fabricate `Date.now()` for a
    // missing value, and never let `new Date("…").getTime()` store a silent
    // NaN. parseEpochMs returns null when the instant cannot be determined.
    createdAt: parseEpochMs(raw.createdAt),
    updatedAt: parseEpochMs(raw.updatedAt),
  };
}
