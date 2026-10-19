/**
 * driveBatchImportApi.ts
 * Readdy 管理画面用 Google Drive 一括取込 API クライアント
 *
 * 認証原則:
 * ・ブラウザは標準の Supabase クライアント (anon key + JWT) で Edge Function `documents-batch-relay` を呼び出す。
 * ・service_role も GAS 管理者キーも worker token もブラウザ側には保持しない。
 */

import { getSupabaseClient } from "@/lib/supabaseClient";

const BATCH_RELAY_FUNCTION = "documents-batch-relay";

export interface BatchImportFileResult {
  file_id: string;
  file_name: string;
  status: "processed" | "flagged" | "skipped" | "error";
  document_id: string | null;
  supplier_name: string | null;
  document_number: string | null;
  declared_net_amount: number | null;
  calculated_total: number | null;
  discrepancy: number | null;
  lines_count: number;
  is_balanced: boolean;
  needs_review_reasons: string[];
  error: string | null;
}

export interface BatchImportSummary {
  total_detected: number;
  processed_count: number;
  flagged_count: number;
  skipped_count: number;
  error_count: number;
}

export interface StartBatchImportResponse {
  success: boolean;
  action: string;
  job_id: string;
  execution_name?: string;
  status: "running" | "completed" | "failed";
  runner?: string;
  operator?: string;
  max_files?: number;
  dry_run: boolean;
  message?: string;
  summary?: BatchImportSummary;
  file_results?: BatchImportFileResult[];
  error?: string;
}

export interface CurrentBatchJobState {
  job_id: string;
  execution_name?: string;
  status: "running" | "completed" | "partially_failed" | "failed";
  result_status?: "in_progress" | "retrieved" | "not_retrieved";
  runner?: string;
  started_at?: string | null;
  finished_at?: string | null;
  message?: string;
  summary?: BatchImportSummary | null;
  file_results?: BatchImportFileResult[];
  error?: string | null;
}

export interface BatchImportStatusResponse {
  success: boolean;
  action: string;
  folders: {
    inbox_folder_id: string;
    processed_folder_id: string;
    flagged_folder_id: string;
  };
  document_ledger_summary: {
    total_documents: number;
    processed_count: number;
    flagged_count: number;
    pending_count: number;
  };
  current_job?: CurrentBatchJobState | null;
}

/**
 * 01_inbox の仕入原本を一括取込開始する
 */
export async function startInboxBatchImport(options: {
  maxFiles?: number;
  dryRun?: boolean;
  fileId?: string;
} = {}): Promise<StartBatchImportResponse> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase client is not connected.");
  }

  const { data, error } = await client.functions.invoke(BATCH_RELAY_FUNCTION, {
    body: {
      action: "start_inbox_import",
      max_files: options.maxFiles ?? 50,
      dry_run: options.dryRun ?? false,
      file_id: options.fileId ?? undefined,
    }
  });

  if (error) {
    throw new Error(error.message || "Failed to invoke batch import Edge Function");
  }

  return data as StartBatchImportResponse;
}

/**
 * 現在の取込フォルダおよび台帳状態を取得する
 */
export async function getInboxBatchImportStatus(): Promise<BatchImportStatusResponse> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase client is not connected.");
  }

  const { data, error } = await client.functions.invoke(BATCH_RELAY_FUNCTION, {
    body: { action: "get_inbox_import_status" }
  });

  if (error) {
    throw new Error(error.message || "Failed to get batch import status");
  }

  return data as BatchImportStatusResponse;
}

