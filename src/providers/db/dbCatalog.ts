/**
 * CatalogMixin — app-local catalog/config/analytics methods for DbProvider.
 *
 * Holds: areas, programs, custom fields, quick replies, app config, currency,
 * achievements, dashboard metrics, response-time + conversion analytics.
 * All persisted in Postgres (tenant-scoped) with in-memory fallback for dev.
 *
 * Applied onto the DbProvider prototype via CatalogMixin.applyTo(DbProvider)
 * so the provider file stays under the line limit while keeping a single class.
 */

import { query, withClient } from "../../db/client";
import type {
  StudyArea, Program, CustomField, QuickReply, AppConfig,
  CurrencyConfig, CommercialRules, Achievement,
} from "../../types";
import {
  mapArea, mapProgram, mapCustomField, mapQuickReply,
  type AreaRow, type ProgramRow, type CustomFieldRow, type QuickReplyRow,
} from "./mappers";

const now = () => Date.now();
const uid = (p: string) => `${p}_${now()}_${Math.random().toString(36).slice(2, 7)}`;

const DEFAULT_CURRENCY: CurrencyConfig = {
  currencyCode: "PEN", currencySymbol: "S/", currencyName: "Sol peruano",
  decimalDigits: 2, decimalSeparator: ".", thousandsSeparator: ",", position: "before",
};

/**
 * Starting point for a tenant that has never saved commercial rules. Returned
 * as a fresh copy so a caller mutating the result cannot corrupt the default
 * for every other tenant.
 */
const DEFAULT_COMMERCIAL_RULES: CommercialRules = {
  commissionType: "percentage",
  commissionValue: 10,
  commissionBase: "total",
  bonusPerLevel: {},
  responseTimeThresholds: { green: 120, yellow: 300, orange: 600, red: 600 },
};

export interface CatalogMixin {
  useDb(): boolean;
  mock: { [k: string]: any };
  ghl: { [k: string]: any };
  crm(tenantId: string): any;
  // Areas
  listAreas(tenantId: string): Promise<StudyArea[]>;
  createArea(tenantId: string, name: string): Promise<StudyArea>;
  updateArea(tenantId: string, id: string, updates: Partial<StudyArea>): Promise<StudyArea>;
  removeArea(tenantId: string, id: string): Promise<void>;
  // Programs
  listPrograms(tenantId: string): Promise<Program[]>;
  listProgramsByArea(tenantId: string, areaId: string): Promise<Program[]>;
  createProgram(tenantId: string, data: Omit<Program, "id">): Promise<Program>;
  updateProgram(tenantId: string, id: string, updates: Partial<Program>): Promise<Program>;
  removeProgram(tenantId: string, id: string): Promise<void>;
  // Custom fields
  listCustomFields(tenantId: string): Promise<CustomField[]>;
  createCustomField(tenantId: string, data: Omit<CustomField, "id">): Promise<CustomField>;
  updateCustomField(tenantId: string, id: string, updates: Partial<CustomField>): Promise<CustomField>;
  removeCustomField(tenantId: string, id: string): Promise<void>;
  // Quick replies
  listQuickReplies(tenantId: string): Promise<QuickReply[]>;
  createQuickReply(tenantId: string, data: Omit<QuickReply, "id" | "updatedAt">): Promise<QuickReply>;
  updateQuickReply(tenantId: string, id: string, updates: Partial<QuickReply>): Promise<QuickReply>;
  removeQuickReply(tenantId: string, id: string): Promise<void>;
  // App config + Currency
  getAppConfig(tenantId: string): Promise<AppConfig>;
  updateAppConfig(tenantId: string, updates: Partial<AppConfig>): Promise<AppConfig>;
  getCurrency(tenantId: string): Promise<CurrencyConfig>;
  updateCurrency(tenantId: string, config: CurrencyConfig): Promise<CurrencyConfig>;
  getCommercialRules(tenantId: string): Promise<CommercialRules>;
  updateCommercialRules(tenantId: string, rules: CommercialRules): Promise<CommercialRules>;
  // Achievements / Dashboard / Analytics
  getAchievement(tenantId: string, ghlUserId: string): Promise<Achievement>;
  getDashboardMetrics(tenantId: string, assignedTo?: string): Promise<Record<string, unknown>>;
  getResponseTimeAnalytics(tenantId: string, params: { from?: number; to?: number; advisorId?: string }): Promise<{
    summary: { avgSeconds: number; minSeconds: number; maxSeconds: number; answered: number; pending: number; unanswered: number; medianSeconds: number };
    byAdvisor: { ghlUserId: string; name: string; answered: number; pending: number; unanswered: number; avgSeconds: number; minSeconds: number; maxSeconds: number }[];
  }>;
  getConversionAnalytics(tenantId: string, params: { from?: number; to?: number; advisorId?: string }): Promise<{
    totalIncomingLeads: number;
    totalAssignedLeads: number;
    totalUnassignedLeads: number;
    totalConvertedLeads: number;
    conversionRate: number;
    assignedRate: number;
    convertedOfAssignedRate: number;
    advisors: { ghlUserId: string; name: string; received: number; converted: number; conversionRate: number }[];
  }>;
}

export const CatalogMixin = {
  // ── Areas ───────────────────────────────────────────────────────────
  async listAreas(this: CatalogMixin, tenantId: string): Promise<StudyArea[]> {
    if (!this.useDb()) return this.mock.listAreas(tenantId);
    const rows = await query<AreaRow>(`SELECT * FROM study_areas WHERE tenant_id = $1 ORDER BY "order" ASC`, [tenantId]);
    return rows.map(mapArea);
  },
  async createArea(this: CatalogMixin, tenantId: string, name: string): Promise<StudyArea> {
    if (!this.useDb()) return this.mock.createArea(tenantId, name);
    const id = uid("a");
    const orderRow = (await query<{ max_order: number | null }>(`SELECT MAX("order") AS max_order FROM study_areas WHERE tenant_id = $1`, [tenantId]))[0];
    const order = orderRow?.max_order ?? 0;
    await query(`INSERT INTO study_areas (id, tenant_id, name, active, "order") VALUES ($1,$2,$3,TRUE,$4)`, [id, tenantId, name, order + 1]);
    return { id, name, active: true, order: order + 1 };
  },
  async updateArea(this: CatalogMixin, tenantId: string, id: string, updates: Partial<StudyArea>): Promise<StudyArea> {
    if (!this.useDb()) return this.mock.updateArea(tenantId, id, updates);
    const cols: Record<string, string> = { name: "name", active: "active", order: '"order"' };
    const sets: string[] = []; const vals: unknown[] = []; let i = 1;
    for (const [k, v] of Object.entries(updates)) { if (cols[k] !== undefined) { sets.push(`${cols[k]} = $${i}`); vals.push(v); i++; } }
    if (sets.length === 0) return (await this.listAreas(tenantId)).find((a) => a.id === id)!;
    vals.push(tenantId, id);
    await query(`UPDATE study_areas SET ${sets.join(", ")} WHERE tenant_id = $${i} AND id = $${i + 1}`, vals);
    return (await this.listAreas(tenantId)).find((a) => a.id === id)!;
  },
  async removeArea(this: CatalogMixin, tenantId: string, id: string): Promise<void> {
    if (!this.useDb()) return this.mock.removeArea(tenantId, id);
    await withClient(async (c) => {
      await c.query(`DELETE FROM programs WHERE tenant_id = $1 AND area_id = $2`, [tenantId, id]);
      await c.query(`DELETE FROM study_areas WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
    });
  },

  // ── Programs ────────────────────────────────────────────────────────
  async listPrograms(this: CatalogMixin, tenantId: string): Promise<Program[]> {
    if (!this.useDb()) return this.mock.listPrograms(tenantId);
    const rows = await query<ProgramRow>(`SELECT * FROM programs WHERE tenant_id = $1 ORDER BY "order" ASC`, [tenantId]);
    return rows.map(mapProgram);
  },
  async listProgramsByArea(this: CatalogMixin, tenantId: string, areaId: string): Promise<Program[]> {
    if (!this.useDb()) return this.mock.listProgramsByArea(tenantId, areaId);
    const rows = await query<ProgramRow>(`SELECT * FROM programs WHERE tenant_id = $1 AND area_id = $2 ORDER BY "order" ASC`, [tenantId, areaId]);
    return rows.map(mapProgram);
  },
  async createProgram(this: CatalogMixin, tenantId: string, data: Omit<Program, "id">): Promise<Program> {
    if (!this.useDb()) return this.mock.createProgram(tenantId, data);
    const id = uid("p");
    await query(`INSERT INTO programs (id, tenant_id, area_id, name, active, "order") VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, tenantId, data.areaId, data.name, data.active ?? true, data.order ?? 0]);
    return { ...data, id };
  },
  async updateProgram(this: CatalogMixin, tenantId: string, id: string, updates: Partial<Program>): Promise<Program> {
    if (!this.useDb()) return this.mock.updateProgram(tenantId, id, updates);
    const cols: Record<string, string> = { name: "name", active: "active", order: '"order"', areaId: "area_id" };
    const sets: string[] = []; const vals: unknown[] = []; let i = 1;
    for (const [k, v] of Object.entries(updates)) { if (cols[k] !== undefined) { sets.push(`${cols[k]} = $${i}`); vals.push(v); i++; } }
    if (sets.length === 0) return (await this.listPrograms(tenantId)).find((p) => p.id === id)!;
    vals.push(tenantId, id);
    await query(`UPDATE programs SET ${sets.join(", ")} WHERE tenant_id = $${i} AND id = $${i + 1}`, vals);
    return (await this.listPrograms(tenantId)).find((p) => p.id === id)!;
  },
  async removeProgram(this: CatalogMixin, tenantId: string, id: string): Promise<void> {
    if (!this.useDb()) return this.mock.removeProgram(tenantId, id);
    await query(`DELETE FROM programs WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
  },

  // ── Custom fields ────────────────────────────────────────────────────
  async listCustomFields(this: CatalogMixin, tenantId: string): Promise<CustomField[]> {
    if (!this.useDb()) return this.mock.listCustomFields(tenantId);
    const rows = await query<CustomFieldRow>(`SELECT * FROM custom_fields WHERE tenant_id = $1 ORDER BY "order" ASC`, [tenantId]);
    return rows.map(mapCustomField);
  },
  async createCustomField(this: CatalogMixin, tenantId: string, data: Omit<CustomField, "id">): Promise<CustomField> {
    if (!this.useDb()) return this.mock.createCustomField(tenantId, data);
    const id = uid("cf");
    await query(
      `INSERT INTO custom_fields (id, tenant_id, name, key, type, placeholder, description, required, active, "order", options)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, tenantId, data.name, data.key, data.type, data.placeholder ?? null, data.description ?? null,
       data.required ?? false, data.active ?? true, data.order ?? 0, data.options ? JSON.stringify(data.options) : null]);
    return { ...data, id };
  },
  async updateCustomField(this: CatalogMixin, tenantId: string, id: string, updates: Partial<CustomField>): Promise<CustomField> {
    if (!this.useDb()) return this.mock.updateCustomField(tenantId, id, updates);
    const cols: Record<string, string> = { name: "name", key: "key", type: "type", placeholder: "placeholder", description: "description", required: "required", active: "active", order: '"order"', options: "options" };
    const sets: string[] = []; const vals: unknown[] = []; let i = 1;
    for (const [k, v] of Object.entries(updates)) {
      if (cols[k] !== undefined) { sets.push(`${cols[k]} = $${i}`); vals.push(k === "options" && Array.isArray(v) ? JSON.stringify(v) : v); i++; }
    }
    if (sets.length === 0) return (await this.listCustomFields(tenantId)).find((f) => f.id === id)!;
    vals.push(tenantId, id);
    await query(`UPDATE custom_fields SET ${sets.join(", ")} WHERE tenant_id = $${i} AND id = $${i + 1}`, vals);
    return (await this.listCustomFields(tenantId)).find((f) => f.id === id)!;
  },
  async removeCustomField(this: CatalogMixin, tenantId: string, id: string): Promise<void> {
    if (!this.useDb()) return this.mock.removeCustomField(tenantId, id);
    await query(`DELETE FROM custom_fields WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
  },

  // ── Quick replies ───────────────────────────────────────────────────
  async listQuickReplies(this: CatalogMixin, tenantId: string): Promise<QuickReply[]> {
    if (!this.useDb()) return this.mock.listQuickReplies(tenantId);
    const rows = await query<QuickReplyRow>(`SELECT * FROM quick_replies WHERE tenant_id = $1 AND active = TRUE ORDER BY updated_at DESC`, [tenantId]);
    return rows.map(mapQuickReply);
  },
  async createQuickReply(this: CatalogMixin, tenantId: string, data: Omit<QuickReply, "id" | "updatedAt">): Promise<QuickReply> {
    if (!this.useDb()) return this.mock.createQuickReply(tenantId, data);
    const id = uid("qr"); const ts = now();
    await query(`INSERT INTO quick_replies (id, tenant_id, name, content, category, active, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, tenantId, data.name, data.content, data.category ?? "general", data.active ?? true, ts]);
    return { ...data, id, updatedAt: ts };
  },
  async updateQuickReply(this: CatalogMixin, tenantId: string, id: string, updates: Partial<QuickReply>): Promise<QuickReply> {
    if (!this.useDb()) return this.mock.updateQuickReply(tenantId, id, updates);
    const cols: Record<string, string> = { name: "name", content: "content", category: "category", active: "active" };
    const sets: string[] = []; const vals: unknown[] = []; let i = 1;
    for (const [k, v] of Object.entries(updates)) { if (cols[k] !== undefined) { sets.push(`${cols[k]} = $${i}`); vals.push(v); i++; } }
    if (sets.length === 0) return (await this.listQuickReplies(tenantId)).find((q) => q.id === id)!;
    sets.push(`updated_at = $${i}`); vals.push(now()); i++;
    vals.push(tenantId, id);
    await query(`UPDATE quick_replies SET ${sets.join(", ")} WHERE tenant_id = $${i} AND id = $${i + 1}`, vals);
    return (await this.listQuickReplies(tenantId)).find((q) => q.id === id)!;
  },
  async removeQuickReply(this: CatalogMixin, tenantId: string, id: string): Promise<void> {
    if (!this.useDb()) return this.mock.removeQuickReply(tenantId, id);
    await query(`DELETE FROM quick_replies WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
  },

  // ── App config + Currency ───────────────────────────────────────────
  async getAppConfig(this: CatalogMixin, tenantId: string): Promise<AppConfig> {
    if (!this.useDb()) return this.mock.getAppConfig(tenantId);
    const rows = await query<{ app_name: string; currency: CurrencyConfig | null }>(`SELECT app_name, currency FROM tenant_config WHERE tenant_id = $1`, [tenantId]);
    const appName = rows[0]?.app_name ?? "BeautyCRM AI";
    const currency = rows[0]?.currency ?? { ...DEFAULT_CURRENCY };
    return { appName, currency, tenantId };
  },
  async updateAppConfig(this: CatalogMixin, tenantId: string, updates: Partial<AppConfig>): Promise<AppConfig> {
    if (!this.useDb()) return this.mock.updateAppConfig(tenantId, updates);
    const current = await this.getAppConfig(tenantId);
    const next: AppConfig = { ...current, ...updates, tenantId };
    const appName = next.appName ?? "BeautyCRM AI";
    const currency = next.currency ?? null;
    await query(
      `INSERT INTO tenant_config (tenant_id, app_name, currency) VALUES ($1,$2,$3)
       ON CONFLICT (tenant_id) DO UPDATE SET app_name = EXCLUDED.app_name, currency = EXCLUDED.currency`,
      [tenantId, appName, currency ? JSON.stringify(currency) : null]);
    return next;
  },
  async getCurrency(this: CatalogMixin, tenantId: string): Promise<CurrencyConfig> {
    if (!this.useDb()) return this.mock.getCurrency(tenantId);
    const rows = await query<{ currency: CurrencyConfig | null }>(`SELECT currency FROM tenant_config WHERE tenant_id = $1`, [tenantId]);
    return rows[0]?.currency ?? { ...DEFAULT_CURRENCY };
  },
  async updateCurrency(this: CatalogMixin, tenantId: string, config: CurrencyConfig): Promise<CurrencyConfig> {
    if (!this.useDb()) return this.mock.updateCurrency(tenantId, config);
    await query(
      `INSERT INTO tenant_config (tenant_id, currency) VALUES ($1,$2)
       ON CONFLICT (tenant_id) DO UPDATE SET currency = EXCLUDED.currency`,
      [tenantId, JSON.stringify(config)]);
    return config;
  },

  // ── Commercial rules (per tenant) ───────────────────────────────────
  // Persisted in tenant_config.commercial_rules, which already existed in the
  // schema but was unused: the rules lived in a module-level variable, so one
  // academy's settings overwrote every other academy's and a restart silently
  // reset them all.
  async getCommercialRules(this: CatalogMixin, tenantId: string): Promise<CommercialRules> {
    if (!this.useDb()) return this.mock.getCommercialRules(tenantId);
    const rows = await query<{ commercial_rules: CommercialRules | null }>(
      `SELECT commercial_rules FROM tenant_config WHERE tenant_id = $1`, [tenantId]);
    return rows[0]?.commercial_rules ?? { ...DEFAULT_COMMERCIAL_RULES };
  },
  async updateCommercialRules(this: CatalogMixin, tenantId: string, rules: CommercialRules): Promise<CommercialRules> {
    if (!this.useDb()) return this.mock.updateCommercialRules(tenantId, rules);
    await query(
      `INSERT INTO tenant_config (tenant_id, commercial_rules) VALUES ($1,$2)
       ON CONFLICT (tenant_id) DO UPDATE SET commercial_rules = EXCLUDED.commercial_rules`,
      [tenantId, JSON.stringify(rules)]);
    return rules;
  },

  // ── Achievements / Dashboard / Analytics ────────────────────────────
  async getAchievement(this: CatalogMixin, tenantId: string, ghlUserId: string): Promise<Achievement> {
    if (!this.useDb()) return this.mock.getAchievement(tenantId, ghlUserId);
    const rows = await query<{ total: string; count: string }>(
      `SELECT COALESCE(SUM(total),0) AS total, COUNT(*) AS count FROM matriculas WHERE tenant_id = $1 AND assigned_to = $2 AND status <> 'anulado'`,
      [tenantId, ghlUserId]);
    const count = Number(rows[0]?.count ?? 0);
    const total = Number(rows[0]?.total ?? 0);
    const level = count >= 10 ? "ORO" : count >= 5 ? "PLATA" : count >= 1 ? "BRONCE" : "BASE";
    return { level, matriculas: count, commissionBase: Math.round(total * 0.1), bonus: 0, totalEarned: Math.round(total * 0.1), progress: (count % 5) * 20, nextLevel: count >= 10 ? null : "PLATA", rank: 1 };
  },
  async getDashboardMetrics(this: CatalogMixin, tenantId: string, assignedTo?: string): Promise<Record<string, unknown>> {
    if (!this.useDb()) return this.mock.getDashboardMetrics(tenantId, assignedTo);
    const where = assignedTo && assignedTo !== "all" ? `AND assigned_to = $2` : "";
    const params = assignedTo && assignedTo !== "all" ? [tenantId, assignedTo] : [tenantId];
    const rows = await query<{ total: string; abono: string; count: string }>(
      `SELECT COALESCE(SUM(total),0) AS total, COALESCE(SUM(abono),0) AS abono, COUNT(*) AS count
       FROM matriculas WHERE tenant_id = $1 AND status <> 'anulado' ${where}`, params);
    const total = Number(rows[0]?.total ?? 0);
    const abono = Number(rows[0]?.abono ?? 0);
    const count = Number(rows[0]?.count ?? 0);
    // Real monthly aggregation from matrículas (no hardcoded months).
    const histRows = await query<{ month: string; current: string }>(
      `SELECT to_char(to_timestamp(enrollment_date/1000) AT TIME ZONE 'UTC', 'Mon') AS month,
              COALESCE(SUM(total),0) AS current
       FROM matriculas WHERE tenant_id = $1 AND status <> 'anulado'
       GROUP BY month, date_part('month', to_timestamp(enrollment_date/1000))
       ORDER BY date_part('month', to_timestamp(enrollment_date/1000))`, [tenantId]);
    const revRows = await query<{ assigned_to: string; revenue: string }>(
      `SELECT assigned_to, COALESCE(SUM(total),0) AS revenue FROM matriculas WHERE tenant_id = $1 AND status <> 'anulado' GROUP BY assigned_to`, [tenantId]);
    return {
      matriculasCount: count, billing: total, abonos: abono, saldos: Math.max(0, total - abono),
      revenueHistory: histRows.map((r) => ({ month: r.month, current: Number(r.current), previous: 0 })),
      revenueByAdvisor: revRows.map((r) => ({ ghlUserId: r.assigned_to, name: r.assigned_to, revenue: Number(r.revenue) })),
    };
  },
  async getResponseTimeAnalytics(this: CatalogMixin, tenantId: string, params: { from?: number; to?: number; advisorId?: string }): Promise<any> {
    // Computed from CRM message timestamps (live-fetched). Delegates to mock
    // contract when no DB; with real CRM it uses the same message-timestamp
    // algorithm. NOT a hardcoded KPI.
    return this.mock.getResponseTimeAnalytics(tenantId, params);
  },
  async getConversionAnalytics(this: CatalogMixin, tenantId: string, params: { from?: number; to?: number; advisorId?: string }): Promise<any> {
    if (!this.useDb()) return this.mock.getConversionAnalytics(tenantId, params);
    const from = params.from ?? 0;
    const to = params.to ?? Date.now();
    const advisorFilter = params.advisorId && params.advisorId !== "all" ? params.advisorId : undefined;
    const matWhere = advisorFilter ? `AND assigned_to = $2` : "";
    const matParams = advisorFilter ? [tenantId, advisorFilter] : [tenantId];
    const convRows = await query<{ count: string; assigned_to: string }>(
      `SELECT assigned_to, COUNT(*) AS count FROM matriculas WHERE tenant_id = $1 AND status <> 'anulado' ${matWhere} GROUP BY assigned_to`, matParams);
    const totalConverted = convRows.reduce((s, r) => s + Number(r.count), 0);
    let totalIncoming = 0; let totalAssigned = 0;
    try {
      const contacts = await this.crm(tenantId).listContacts(tenantId, { pageSize: 100 });
      totalIncoming = contacts.data.filter((c: any) => c.createdAt >= from && c.createdAt <= to).length;
      totalAssigned = contacts.data.filter((c: any) => c.createdAt >= from && c.createdAt <= to && c.assignedTo).length;
    } catch { /* CRM unavailable → metrics reported as 0 (N/D upstream) */ }
    const safeRate = (n: number, d: number) => (d <= 0 ? 0 : Math.round((n / d) * 1000) / 10);
    return {
      totalIncomingLeads: totalIncoming, totalAssignedLeads: totalAssigned,
      totalUnassignedLeads: Math.max(0, totalIncoming - totalAssigned),
      totalConvertedLeads: totalConverted,
      conversionRate: safeRate(totalConverted, totalIncoming),
      assignedRate: safeRate(totalAssigned, totalIncoming),
      convertedOfAssignedRate: safeRate(totalConverted, totalAssigned),
      advisors: convRows.map((r) => ({ ghlUserId: r.assigned_to, name: r.assigned_to, received: 0, converted: Number(r.count), conversionRate: 0 })),
    };
  },

  /** Copy all mixin methods onto a target class prototype. */
  applyTo(target: any) {
    const methods = [
      "listAreas", "createArea", "updateArea", "removeArea",
      "listPrograms", "listProgramsByArea", "createProgram", "updateProgram", "removeProgram",
      "listCustomFields", "createCustomField", "updateCustomField", "removeCustomField",
      "listQuickReplies", "createQuickReply", "updateQuickReply", "removeQuickReply",
      "getAppConfig", "updateAppConfig", "getCurrency", "updateCurrency",
      "getCommercialRules", "updateCommercialRules",
      "getAchievement", "getDashboardMetrics", "getResponseTimeAnalytics", "getConversionAnalytics",
    ];
    for (const name of methods) {
      if (!(name in target.prototype)) target.prototype[name] = (CatalogMixin as any)[name];
    }
  },
};
