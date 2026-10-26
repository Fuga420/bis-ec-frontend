/**
 * excel_purchase_import.mjs
 * AIS_BIS_統合在庫台帳.xlsx「仕入明細」の採用済み購入明細 一括取込スクリプト
 *
 * 必須ルール:
 *  1. 新規原本と新規明細は追加する。
 *  2. 既存明細のID、商品金額、手数料、配分済み税額、税込行合計、商品リンクは上書きしない。
 *  3. 既存原本に不足する明細があれば、既存行を変更せずに追加できるAPI経路(save_document_lines新規行挿入)で追加する。
 *  4. Excelで行別税額が空欄なら、空欄を0円や推定税額に変換しない(nullのまま保存)。税抜額を税込のtotal_line_amountとして保存しない(nullのまま保存)。
 *  5. 受付番号やファイル名だけで同一明細と断定しない。判定が曖昧な行は登録せず報告する。
 *  6. 請求書の精算額を、購入明細だけの合計と一致する金額として登録しない(documents.total_amount = null)。
 *
 * 実行方法:
 *  node scripts/excel_purchase_import.mjs --dry-run
 *  node scripts/excel_purchase_import.mjs --execute
 */

import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -----------------------------------------------------------------------------
// 環境変数ロード
// -----------------------------------------------------------------------------
function loadEnv() {
  const envFiles = [
    path.resolve(__dirname, "../.env"),
    path.resolve(__dirname, "../.env.local"),
  ];
  for (const envPath of envFiles) {
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, "utf8").split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
          ) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  }
}
loadEnv();

const CONFIG = {
  supabaseUrl:
    process.env.VITE_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    "https://yg9qauzldubdo1ca5z0z.helloreaddy.com",
  supabaseAnonKey:
    process.env.VITE_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "",
  workerSecret: process.env.DOCUMENTS_WORKER_SECRET || "",
  defaultExcelPath: path.resolve(
    __dirname,
    "../../ais-ec-gas-drive-import/AIS_BIS_統合在庫台帳.xlsx"
  ),
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// -----------------------------------------------------------------------------
// 軽量 ZIP / XLSX リーダー (外部パッケージ不要)
// -----------------------------------------------------------------------------
function readZipEntries(filePath) {
  const buf = fs.readFileSync(filePath);
  const entries = new Map();

  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error("Invalid ZIP/XLSX file: EOCD not found");
  }

  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);

  let ptr = cdOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (buf.readUInt32LE(ptr) !== 0x02014b50) {
      throw new Error("Invalid Central Directory header");
    }
    const compressionMethod = buf.readUInt16LE(ptr + 10);
    const compressedSize = buf.readUInt32LE(ptr + 20);
    const fileNameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localHeaderOffset = buf.readUInt32LE(ptr + 42);
    const entryName = buf.toString("utf8", ptr + 46, ptr + 46 + fileNameLen);

    const localFileNameLen = buf.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localFileNameLen + localExtraLen;
    const compData = buf.subarray(dataStart, dataStart + compressedSize);

    let contentBuf;
    if (compressionMethod === 0) {
      contentBuf = compData;
    } else if (compressionMethod === 8) {
      contentBuf = zlib.inflateRawSync(compData);
    } else {
      throw new Error(`Unsupported compression method: ${compressionMethod}`);
    }

    entries.set(entryName, contentBuf);
    ptr += 46 + fileNameLen + extraLen + commentLen;
  }

  return entries;
}

function decodeXmlEntities(str) {
  if (!str) return "";
  return str
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

function parseSharedStrings(xmlText) {
  const strings = [];
  const siRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = siRegex.exec(xmlText)) !== null) {
    const siBody = m[1];
    const tRegex = /<t(?:\s+[^>]*)?>([\s\S]*?)<\/t>/g;
    let tm;
    let combined = "";
    while ((tm = tRegex.exec(siBody)) !== null) {
      combined += decodeXmlEntities(tm[1]);
    }
    strings.push(combined);
  }
  return strings;
}

function parseWorksheetRows(xmlText, sharedStrings) {
  const rows = [];
  const rowRegex = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
  let rm;
  while ((rm = rowRegex.exec(xmlText)) !== null) {
    const rowAttrs = rm[1];
    const rowBody = rm[2] || "";
    const rMatch = rowAttrs.match(/\br="(\d+)"/);
    const rowNum = rMatch ? parseInt(rMatch[1], 10) : 0;

    const cells = {};
    const cellRegex = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm;
    while ((cm = cellRegex.exec(rowBody)) !== null) {
      const cAttrs = cm[1];
      const cBody = cm[2] || "";
      const refMatch = cAttrs.match(/\br="([A-Z]+)\d+"/);
      if (!refMatch) continue;
      const col = refMatch[1];
      const typeMatch = cAttrs.match(/\bt="([^"]+)"/);
      const cellType = typeMatch ? typeMatch[1] : "";

      let val = "";
      if (cellType === "s") {
        const vMatch = cBody.match(/<v>([\s\S]*?)<\/v>/);
        if (vMatch) {
          const idx = parseInt(vMatch[1].trim(), 10);
          val = sharedStrings[idx] ?? "";
        }
      } else if (cellType === "inlineStr") {
        const tRegex = /<t(?:\s+[^>]*)?>([\s\S]*?)<\/t>/g;
        let tm;
        while ((tm = tRegex.exec(cBody)) !== null) {
          val += decodeXmlEntities(tm[1]);
        }
      } else {
        const vMatch = cBody.match(/<v>([\s\S]*?)<\/v>/);
        if (vMatch) {
          val = decodeXmlEntities(vMatch[1].trim());
        }
      }
      cells[col] = val;
    }
    rows.push({ rowNum, cells });
  }
  return rows;
}

function excelDateToIso(serialOrStr) {
  if (!serialOrStr) return null;
  const trimmed = String(serialOrStr).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num < 30000) return null;
  const utcMs = Math.round((num - 25569) * 86400 * 1000);
  return new Date(utcMs).toISOString().slice(0, 10);
}

function toNumOrNull(val) {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : null;
}

// -----------------------------------------------------------------------------
// API 呼び出し (書込は documents-relay、大量読取は PostgREST GET でレート制限回避)
// -----------------------------------------------------------------------------
async function invokeRelay(payload, maxRetries = 5) {
  const url = `${CONFIG.supabaseUrl}/functions/v1/documents-relay`;
  const headers = {
    apikey: CONFIG.supabaseAnonKey,
    Authorization: `Bearer ${CONFIG.supabaseAnonKey}`,
    "Content-Type": "application/json",
  };
  if (CONFIG.workerSecret) {
    headers["x-bis-worker-token"] = CONFIG.workerSecret;
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { success: false, error: text };
    }

    if (res.ok && data?.success) {
      return { status: res.status, ok: res.ok, data };
    }

    // Edge Function 内部の PostgREST 一時レート制限時は待機してリトライ
    if (res.status >= 500 || res.status === 429) {
      const waitMs = attempt * 5000;
      console.warn(
        `    [Retry ${attempt}/${maxRetries}] HTTP ${res.status} (${data?.error_code || "ERR"}), waiting ${waitMs}ms...`
      );
      await sleep(waitMs);
      continue;
    }

    return { status: res.status, ok: res.ok, data };
  }

  throw new Error(`invokeRelay exhausted retries for action=${payload.action}`);
}

async function fetchRestTableAll(table, queryParams = "is_deleted=eq.false") {
  const allRows = [];
  const pageSize = 1000;
  let offset = 0;
  while (true) {
    const url = `${CONFIG.supabaseUrl}/rest/v1/${table}?select=*&${queryParams}&order=created_at.asc&offset=${offset}&limit=${pageSize}`;
    const res = await fetch(url, {
      headers: {
        apikey: CONFIG.supabaseAnonKey,
        Authorization: `Bearer ${CONFIG.supabaseAnonKey}`,
      },
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch ${table}: HTTP ${res.status}`);
    }
    const rows = await res.json();
    allRows.push(...rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return allRows;
}

async function fetchAllDbDocumentsWithLines() {
  const docs = await fetchRestTableAll("documents");
  const lines = await fetchRestTableAll(
    "document_lines",
    "is_deleted=eq.false&is_active=eq.true"
  );
  const links = await fetchRestTableAll("document_product_links");

  const linksByLineId = new Map();
  for (const lk of links) {
    if (!linksByLineId.has(lk.document_line_id)) {
      linksByLineId.set(lk.document_line_id, []);
    }
    linksByLineId.get(lk.document_line_id).push(lk);
  }

  const linesByDocId = new Map();
  for (const l of lines) {
    const enrichedLine = {
      ...l,
      links: linksByLineId.get(l.id) || [],
    };
    if (!linesByDocId.has(l.document_id)) {
      linesByDocId.set(l.document_id, []);
    }
    linesByDocId.get(l.document_id).push(enrichedLine);
  }

  for (const arr of linesByDocId.values()) {
    arr.sort((a, b) => Number(a.line_number) - Number(b.line_number));
  }

  return docs.map((d) => ({
    document: d,
    lines: linesByDocId.get(d.id) || [],
  }));
}

// -----------------------------------------------------------------------------
// Excel 解析・データ構造化
// -----------------------------------------------------------------------------
function loadExcelPurchaseData(excelPath) {
  if (!fs.existsSync(excelPath)) {
    throw new Error(`Excel file not found: ${excelPath}`);
  }
  const entries = readZipEntries(excelPath);
  const sharedStrings = parseSharedStrings(
    entries.get("xl/sharedStrings.xml").toString("utf8")
  );
  const sheet3Rows = parseWorksheetRows(
    entries.get("xl/worksheets/sheet3.xml").toString("utf8"),
    sharedStrings
  );
  const sheet4Rows = parseWorksheetRows(
    entries.get("xl/worksheets/sheet4.xml").toString("utf8"),
    sharedStrings
  );

  // 請求書台帳 (sheet4, r >= 7)
  const invoiceMap = new Map();
  for (const r of sheet4Rows) {
    if (r.rowNum < 7) continue;
    const c = r.cells;
    const driveId = (c.A || "").trim();
    if (!driveId) continue;
    invoiceMap.set(driveId, {
      drive_file_id: driveId,
      supplier_name: (c.B || "").trim(),
      issue_date: excelDateToIso(c.C),
      adoption_status: (c.D || "").trim(),
      file_name: (c.E || "").trim(),
      purchase_item_net: toNumOrNull(c.F),
      fee_net: toNumOrNull(c.G),
      other_expense_net: toNumOrNull(c.H),
      purchase_item_tax: toNumOrNull(c.I),
      fee_tax: toNumOrNull(c.J),
      other_expense_tax: toNumOrNull(c.K),
      purchase_side_gross: toNumOrNull(c.L),
      sale_settlement_gross: toNumOrNull(c.M),
      separate_fee_gross: toNumOrNull(c.N),
      declared_settlement_amount: toNumOrNull(c.R),
      extracted_purchase_count: toNumOrNull(c.U),
      extracted_item_sum: toNumOrNull(c.V),
      notes: (c.Y || "").trim(),
      drive_file_url: (c.Z || "").trim(),
    });
  }

  // 仕入明細 (sheet3, r >= 7, B="採用" && C="購入")
  const allRowsCount = sheet3Rows.filter((r) => r.rowNum >= 7 && r.cells.A).length;
  const adoptedPurchaseRows = [];

  for (const r of sheet3Rows) {
    if (r.rowNum < 7) continue;
    const c = r.cells;
    if ((c.B || "").trim() !== "採用" || (c.C || "").trim() !== "購入") {
      continue;
    }

    const itemAmount = toNumOrNull(c.N);
    const taxAmount = toNumOrNull(c.P); // 空欄なら null (0や推定値に変換しない)
    const feeAmount = toNumOrNull(c.Q);
    const feeTaxAmount = toNumOrNull(c.R); // 空欄なら null
    const itemGrossInExcel = toNumOrNull(c.S); // 空欄なら null

    // 必須ルール: 行別税額が空欄なら税抜額を税込の total_line_amount として保存しない (null とする)
    // 行別税額(商品税 P列)が確定している行のみ、税込行合計 (N + P + Q + R) を格納する
    const hasLineTax = taxAmount !== null;
    const totalLineAmount = hasLineTax
      ? (itemAmount ?? 0) +
        taxAmount +
        (feeAmount ?? 0) +
        (feeTaxAmount ?? 0)
      : null;

    const recRaw = (c.F || "").trim() || null;
    const recParts = recRaw && recRaw.includes("-") ? recRaw.split("-") : [];

    adoptedPurchaseRows.push({
      excel_row_num: r.rowNum,
      management_id: (c.A || "").trim(),
      adoption_status: (c.B || "").trim(),
      transaction_category: (c.C || "").trim(),
      purchase_date: excelDateToIso(c.D),
      supplier_name: (c.E || "").trim(),
      reception_number_raw: recRaw,
      reception_number_normalized: recRaw
        ? recRaw.toUpperCase().replace(/\s+/g, "")
        : null,
      lot_number: recParts[0] || null,
      branch_number: recParts[1] || null,
      auction_bid_number: (c.G || "").trim() || null,
      item_name_raw: (c.H || "").trim(),
      quantity: toNumOrNull(c.I),
      item_amount: itemAmount,
      tax_category: (c.O || "").trim(),
      tax_amount: taxAmount,
      fee_amount: feeAmount,
      fee_tax_amount: feeTaxAmount,
      item_gross_excel: itemGrossInExcel,
      total_line_amount: totalLineAmount,
      page_number: toNumOrNull(c.T) || 1,
      document_number: (c.U || "").trim() || null,
      file_name: (c.V || "").trim(),
      drive_file_url: (c.W || "").trim(),
      confirm_note: (c.X || "").trim() || null,
      drive_file_id: (c.Y || "").trim(),
    });
  }

  return {
    allRowsCount,
    adoptedPurchaseRows,
    invoiceMap,
  };
}

// -----------------------------------------------------------------------------
// 既存DBとの厳密突合・分類
// -----------------------------------------------------------------------------
function classifyDocumentsAndLines(adoptedPurchaseRows, invoiceMap, dbDocs) {
  const docGroupsMap = new Map();
  for (const row of adoptedPurchaseRows) {
    if (!docGroupsMap.has(row.drive_file_id)) {
      docGroupsMap.set(row.drive_file_id, {
        drive_file_id: row.drive_file_id,
        file_name: row.file_name,
        supplier_name: row.supplier_name,
        issue_date: row.purchase_date,
        document_number: row.document_number,
        drive_file_url: row.drive_file_url,
        invoice_meta: invoiceMap.get(row.drive_file_id) || null,
        rows: [],
      });
    }
    const g = docGroupsMap.get(row.drive_file_id);
    g.rows.push({
      ...row,
      assigned_line_number: g.rows.length + 1,
    });
  }

  const dbByDriveId = new Map();
  const dbByFileName = new Map();
  for (const entry of dbDocs) {
    const d = entry.document;
    if (d.drive_file_id) dbByDriveId.set(d.drive_file_id, entry);
    if (d.file_name) {
      if (!dbByFileName.has(d.file_name)) dbByFileName.set(d.file_name, []);
      dbByFileName.get(d.file_name).push(entry);
    }
  }

  const plan = {
    new_documents: [], // 新規原本 + 新規明細
    existing_doc_append_lines: [], // 既存原本への不足明細追加 (既存行は一切変更しない)
    existing_kept_documents: [], // 既存維持 (一切上書きしない)
    ambiguous_held_documents: [], // 判定が曖昧なため安全上保留・未取込
  };

  for (const group of docGroupsMap.values()) {
    const byDriveId = dbByDriveId.get(group.drive_file_id);
    const byNameList = dbByFileName.get(group.file_name) || [];

    // Case 1: DBに drive_file_id も file_name も存在しない => 完全新規原本
    if (!byDriveId && byNameList.length === 0) {
      const invalidRows = group.rows.filter(
        (r) =>
          !r.drive_file_id ||
          !r.file_name ||
          !r.item_name_raw ||
          r.item_amount === null ||
          !r.reception_number_raw
      );
      if (invalidRows.length > 0) {
        plan.ambiguous_held_documents.push({
          reason: "MISSING_REQUIRED_FIELDS_IN_EXCEL",
          group,
          db_document: null,
          rows: group.rows,
        });
      } else {
        plan.new_documents.push(group);
      }
      continue;
    }

    // Case 2: DBに既存原本が存在する場合
    const matchedDbEntry =
      byDriveId || (byNameList.length === 1 ? byNameList[0] : null);
    if (!matchedDbEntry) {
      plan.ambiguous_held_documents.push({
        reason: "MULTIPLE_DB_DOCS_WITH_SAME_FILENAME",
        group,
        db_document: null,
        rows: group.rows,
      });
      continue;
    }

    const dbDoc = matchedDbEntry.document;
    const dbPurchaseLines = matchedDbEntry.lines.filter(
      (l) => l.transaction_type === "purchase" && !l.is_deleted
    );
    const dbAllLines = matchedDbEntry.lines.filter((l) => !l.is_deleted);

    // Subcase 2A: 既存原本の drive_file_id が完全一致し、DB側の既存明細が0行の原本 (例: 11.30.pdf)
    if (byDriveId && dbAllLines.length === 0 && group.rows.length > 0) {
      plan.existing_doc_append_lines.push({
        reason: "EXISTING_DOC_WITH_ZERO_LINES_DRIVE_ID_EXACT_MATCH",
        group,
        db_document: dbDoc,
        rows_to_insert: group.rows,
        existing_kept_rows: [],
      });
      continue;
    }

    // Subcase 2B: DB側に既存購入明細があり、全行が (page_number, reception_number_raw, item_amount, fee_amount) で1対1一致
    if (dbPurchaseLines.length === group.rows.length) {
      let allMatchedStrictly = true;
      const matchedPairs = [];

      for (const exRow of group.rows) {
        const candidates = dbPurchaseLines.filter(
          (dl) =>
            Number(dl.page_number) === Number(exRow.page_number) &&
            (dl.reception_number_raw || "") ===
              (exRow.reception_number_raw || "") &&
            Boolean(dl.reception_number_raw) &&
            Number(dl.item_amount) === Number(exRow.item_amount) &&
            Number(dl.fee_amount ?? 0) === Number(exRow.fee_amount ?? 0)
        );
        if (candidates.length !== 1) {
          allMatchedStrictly = false;
          break;
        }
        matchedPairs.push({ exRow, dbLine: candidates[0] });
      }

      if (allMatchedStrictly) {
        plan.existing_kept_documents.push({
          reason: byDriveId
            ? "DRIVE_ID_AND_ALL_LINE_KEYS_AMOUNTS_MATCHED"
            : "FILENAME_PAGE_RECEPTION_AND_AMOUNTS_MATCHED_INBOX_COPY",
          group,
          db_document: dbDoc,
          matched_pairs: matchedPairs,
          rows: group.rows,
        });
        continue;
      }
    }

    // Subcase 2C: drive_file_id 完全一致 かつ 既存明細が全てExcelの先頭部分と完全一致し、残りの行だけ未登録の原本
    // (一切の既存行を変更せず、未登録の line_number のみ新規INSERT可能なケース)
    if (
      byDriveId &&
      dbAllLines.length > 0 &&
      dbAllLines.length < group.rows.length
    ) {
      let existingSubsetMatchesStrictly = true;
      const matchedExManagementIds = new Set();
      const occupiedPageLineKeys = new Set(
        dbAllLines.map((dl) => `${dl.page_number}:${dl.line_number}`)
      );

      for (const dl of dbAllLines) {
        const matchingEx = group.rows.find(
          (er) =>
            Number(er.assigned_line_number) === Number(dl.line_number) &&
            Number(er.page_number) === Number(dl.page_number) &&
            (er.reception_number_raw || "") ===
              (dl.reception_number_raw || "") &&
            Boolean(dl.reception_number_raw) &&
            Number(er.item_amount) === Number(dl.item_amount) &&
            Number(er.fee_amount ?? 0) === Number(dl.fee_amount ?? 0)
        );
        if (!matchingEx) {
          existingSubsetMatchesStrictly = false;
          break;
        }
        matchedExManagementIds.add(matchingEx.management_id);
      }

      if (existingSubsetMatchesStrictly) {
        const missingRows = group.rows.filter(
          (er) => !matchedExManagementIds.has(er.management_id)
        );
        const hasKeyCollision = missingRows.some((er) =>
          occupiedPageLineKeys.has(`${er.page_number}:${er.assigned_line_number}`)
        );
        if (!hasKeyCollision && missingRows.length > 0) {
          plan.existing_doc_append_lines.push({
            reason: "EXISTING_DOC_APPEND_MISSING_LINES_WITHOUT_TOUCHING_EXISTING",
            group,
            db_document: dbDoc,
            rows_to_insert: missingRows,
            existing_kept_rows: group.rows.filter((er) =>
              matchedExManagementIds.has(er.management_id)
            ),
          });
          continue;
        }
      }
    }

    // Subcase 2D: 受付番号欠落・行数不一致・判定が曖昧な既存原本 => 安全上保留(変更も追加もしない)
    plan.ambiguous_held_documents.push({
      reason:
        "EXISTING_DB_LINES_LACK_RECEPTION_NUMBER_OR_DRIVE_ID_DIFFERS_CANNOT_CONFIRM_IDENTITY",
      group,
      db_document: dbDoc,
      db_purchase_lines: dbPurchaseLines,
      rows: group.rows,
    });
  }

  return plan;
}

// -----------------------------------------------------------------------------
// API ペイロード構築
// -----------------------------------------------------------------------------
function buildRegisterDocumentPayload(group) {
  const inv = group.invoice_meta;
  const notesMetadata = {
    source: "AIS_BIS_統合在庫台帳.xlsx",
    sheet: "仕入明細",
    imported_scope: "adopted_purchase_only",
    purchase_lines_count: group.rows.length,
    management_id_range: `${group.rows[0].management_id}..${group.rows[group.rows.length - 1].management_id}`,
    invoice_ledger_ref: inv
      ? {
          declared_settlement_amount: inv.declared_settlement_amount,
          purchase_side_gross: inv.purchase_side_gross,
          purchase_item_net: inv.purchase_item_net,
          purchase_item_tax: inv.purchase_item_tax,
          fee_net: inv.fee_net,
          fee_tax: inv.fee_tax,
        }
      : null,
  };

  return {
    action: "register_drive_document",
    idempotency_key: `drive:${group.drive_file_id}`,
    drive_file_id: group.drive_file_id,
    file_name: group.file_name,
    mime_type: "application/pdf",
    document_type: "invoice",
    supplier_name: group.supplier_name,
    document_number: group.document_number || null,
    issue_date: group.issue_date || (inv ? inv.issue_date : null),
    // 必須ルール: 請求書の精算額を、購入明細だけの合計と一致する金額として登録しない
    total_amount: null,
    tax_amount: null,
    drive_file_url:
      group.drive_file_url ||
      `https://drive.google.com/file/d/${group.drive_file_id}/view`,
    notes: JSON.stringify(notesMetadata),
    confirmed_by: "excel-purchase-importer",
  };
}

function buildLineObjects(rows) {
  return rows.map((r, idx) => {
    const noteParts = [`管理ID:${r.management_id}`];
    if (r.tax_amount === null) {
      noteParts.push("税区分:税抜(行別税額空欄・請求書一括税)");
    }
    if (r.confirm_note) {
      noteParts.push(`確認事項:${r.confirm_note}`);
    }

    return {
      line_number: r.assigned_line_number || idx + 1,
      page_number: r.page_number || 1,
      reception_number_raw: r.reception_number_raw,
      reception_number_normalized: r.reception_number_normalized,
      lot_number: r.lot_number,
      branch_number: r.branch_number,
      auction_bid_number: r.auction_bid_number,
      item_name_raw: r.item_name_raw,
      brand_name_raw: null,
      transaction_type: "purchase",
      item_amount: r.item_amount,
      // 必須ルール: 行別税額が空欄なら 0 や推定税額に変換せず null のまま保存
      tax_amount: r.tax_amount,
      fee_amount: r.fee_amount,
      fee_tax_amount: r.fee_tax_amount,
      // 必須ルール: 行別税額が空欄なら税抜額を税込の total_line_amount として保存しない (null)
      total_line_amount: r.total_line_amount,
      notes: noteParts.join(" / "),
    };
  });
}

// 大量行の書類でも Edge Function 内のサブリクエスト上限を超えないよう 15行ずつ分割保存
async function saveDocumentLinesInChunks(documentId, rows, chunkSize = 15) {
  const allLineObjs = buildLineObjects(rows);
  for (let offset = 0; offset < allLineObjs.length; offset += chunkSize) {
    const chunk = allLineObjs.slice(offset, offset + chunkSize);
    const saveRes = await invokeRelay({
      action: "save_document_lines",
      document_id: documentId,
      lines: chunk,
    });
    if (!saveRes.ok || !saveRes.data?.success) {
      throw new Error(
        `save_document_lines failed for doc ${documentId} (offset=${offset}): ${JSON.stringify(saveRes.data)}`
      );
    }
    await sleep(300);
  }
}

// -----------------------------------------------------------------------------
// メイン処理
// -----------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const isExecute = args.includes("--execute");
  const isDryRun = !isExecute;
  const excelArg = args.find((a) => a.startsWith("--excel="));
  const excelPath = excelArg
    ? path.resolve(excelArg.slice("--excel=".length))
    : CONFIG.defaultExcelPath;

  console.log("==============================================================");
  console.log(
    `B.I.S EC 統合仕入台帳 採用済み購入明細 一括取込 (${isDryRun ? "DRY-RUN" : "EXECUTE"})`
  );
  console.log(`対象台帳: ${excelPath}`);
  console.log("==============================================================\n");

  if (!CONFIG.supabaseAnonKey || !CONFIG.workerSecret) {
    throw new Error(
      "Missing VITE_PUBLIC_SUPABASE_ANON_KEY or DOCUMENTS_WORKER_SECRET in .env / .env.local"
    );
  }

  // 1. Excel 読み込み
  const { allRowsCount, adoptedPurchaseRows, invoiceMap } =
    loadExcelPurchaseData(excelPath);
  console.log(
    `[Step 1] Excel読込完了: 仕入明細全行=${allRowsCount}行, 採用済み購入明細=${adoptedPurchaseRows.length}行`
  );

  // 2. 既存DB全件取得 (Snapshot Before)
  const dbDocsBefore = await fetchAllDbDocumentsWithLines();
  const existingLinesBeforeMap = new Map();
  let totalExistingLinesBefore = 0;
  let totalExistingLinksBefore = 0;
  for (const d of dbDocsBefore) {
    for (const l of d.lines) {
      totalExistingLinesBefore++;
      const linksCount = Array.isArray(l.links) ? l.links.length : 0;
      totalExistingLinksBefore += linksCount;
      existingLinesBeforeMap.set(l.id, {
        document_id: d.document.id,
        file_name: d.document.file_name,
        item_amount: l.item_amount,
        fee_amount: l.fee_amount,
        tax_amount: l.tax_amount,
        fee_tax_amount: l.fee_tax_amount,
        total_line_amount: l.total_line_amount,
        reception_number_raw: l.reception_number_raw,
        links_json: JSON.stringify(l.links || []),
      });
    }
  }
  console.log(
    `[Step 2] 既存DB取得完了: 書類=${dbDocsBefore.length}件, 明細=${totalExistingLinesBefore}行, 商品リンク=${totalExistingLinksBefore}件`
  );

  // 3. 突合・分類
  const plan = classifyDocumentsAndLines(
    adoptedPurchaseRows,
    invoiceMap,
    dbDocsBefore
  );

  const newDocCount = plan.new_documents.length;
  const newLinesInNewDocs = plan.new_documents.reduce(
    (s, g) => s + g.rows.length,
    0
  );
  const appendDocCount = plan.existing_doc_append_lines.length;
  const appendLinesCount = plan.existing_doc_append_lines.reduce(
    (s, x) => s + x.rows_to_insert.length,
    0
  );
  const keptDocCount = plan.existing_kept_documents.length;
  const keptLinesCount =
    plan.existing_kept_documents.reduce((s, x) => s + x.rows.length, 0) +
    plan.existing_doc_append_lines.reduce(
      (s, x) => s + (x.existing_kept_rows?.length || 0),
      0
    );
  const heldDocCount = plan.ambiguous_held_documents.length;
  const heldLinesCount = plan.ambiguous_held_documents.reduce(
    (s, x) => s + x.rows.length,
    0
  );

  console.log("\n[Step 3] 突合・分類結果サマリー:");
  console.log(
    `  1. 新規追加対象 (完全新規原本): ${newDocCount} 原本 / ${newLinesInNewDocs} 明細行`
  );
  console.log(
    `  2. 既存原本への不足明細追加 (既存行変更なし): ${appendDocCount} 原本 / ${appendLinesCount} 明細行`
  );
  for (const ap of plan.existing_doc_append_lines) {
    console.log(
      `     - DB Document ID: ${ap.db_document.id} (${ap.group.file_name}, drive_file_id=${ap.group.drive_file_id})`
    );
    console.log(
      `       追加対象管理ID (${ap.rows_to_insert.length}行): ${ap.rows_to_insert.map((r) => r.management_id).join(", ")}`
    );
  }
  console.log(
    `  3. 既存維持 (上書き・変更なし): ${keptDocCount} 原本 (完了分) / ${keptLinesCount} 明細行`
  );
  console.log(
    `  4. 判定が曖昧な行 (安全上保留・未取込): ${heldDocCount} 原本 / ${heldLinesCount} 明細行`
  );
  for (const hd of plan.ambiguous_held_documents) {
    console.log(
      `     - DB Document ID: ${hd.db_document?.id || "N/A"} (${hd.group.file_name}, Excel drive_file_id=${hd.group.drive_file_id}, DB drive_file_id=${hd.db_document?.drive_file_id})`
    );
    console.log(
      `       保留対象管理ID: ${hd.rows.map((r) => `${r.management_id}(受付:${r.reception_number_raw}, 税抜:${r.item_amount})`).join(", ")}`
    );
    console.log(`       保留理由: ${hd.reason}`);
  }

  if (isDryRun) {
    console.log(
      "\n[DRY-RUN 完了] DBへの書込は行っていません。--execute を指定すると一括取込を実行します。"
    );
    return;
  }

  // 4. 本番一括取込の実行
  console.log("\n[Step 4] 一括取込を実行中...");
  let insertedDocsCount = 0;
  let insertedLinesCount = 0;
  let appendedDocsCount = 0;
  let appendedLinesCount = 0;

  // 4A. 既存原本への不足明細追加
  for (const ap of plan.existing_doc_append_lines) {
    await saveDocumentLinesInChunks(ap.db_document.id, ap.rows_to_insert, 15);
    appendedDocsCount++;
    appendedLinesCount += ap.rows_to_insert.length;
    console.log(
      `  ✓ [既存原本へ不足明細追加] ${ap.group.file_name} (ID=${ap.db_document.id}): +${ap.rows_to_insert.length}行`
    );
  }

  // 4B. 新規原本の登録 + 明細登録
  for (let i = 0; i < plan.new_documents.length; i++) {
    const group = plan.new_documents[i];
    const regPayload = buildRegisterDocumentPayload(group);
    const regRes = await invokeRelay(regPayload);
    if (!regRes.ok || !regRes.data?.success || !regRes.data?.document?.id) {
      throw new Error(
        `register_drive_document failed for ${group.file_name} (${group.drive_file_id}): ${JSON.stringify(regRes.data)}`
      );
    }
    await sleep(250);

    const newDocId = regRes.data.document.id;
    await saveDocumentLinesInChunks(newDocId, group.rows, 15);

    insertedDocsCount++;
    insertedLinesCount += group.rows.length;
    console.log(
      `  ✓ [新規原本完了 ${i + 1}/${plan.new_documents.length}] ${group.file_name} (ID=${newDocId}): +${group.rows.length}行`
    );
  }

  // 5. 実行後の実DB検証 (Snapshot After)
  console.log("\n[Step 5] 実DB事後検証を実行中...");
  const dbDocsAfter = await fetchAllDbDocumentsWithLines();
  let totalLinesAfter = 0;
  let modifiedExistingLinesCount = 0;
  let missingExistingLinesCount = 0;

  const afterLineMap = new Map();
  for (const d of dbDocsAfter) {
    for (const l of d.lines) {
      totalLinesAfter++;
      afterLineMap.set(l.id, {
        document_id: d.document.id,
        file_name: d.document.file_name,
        item_amount: l.item_amount,
        fee_amount: l.fee_amount,
        tax_amount: l.tax_amount,
        fee_tax_amount: l.fee_tax_amount,
        total_line_amount: l.total_line_amount,
        reception_number_raw: l.reception_number_raw,
        links_json: JSON.stringify(l.links || []),
      });
    }
  }

  for (const [lineId, beforeSnap] of existingLinesBeforeMap.entries()) {
    const afterSnap = afterLineMap.get(lineId);
    if (!afterSnap) {
      missingExistingLinesCount++;
      console.error(`  ✗ 既存明細が消失: ID=${lineId}`);
      continue;
    }
    if (
      beforeSnap.item_amount !== afterSnap.item_amount ||
      beforeSnap.fee_amount !== afterSnap.fee_amount ||
      beforeSnap.tax_amount !== afterSnap.tax_amount ||
      beforeSnap.fee_tax_amount !== afterSnap.fee_tax_amount ||
      beforeSnap.total_line_amount !== afterSnap.total_line_amount ||
      beforeSnap.reception_number_raw !== afterSnap.reception_number_raw ||
      beforeSnap.links_json !== afterSnap.links_json
    ) {
      modifiedExistingLinesCount++;
      console.error(
        `  ✗ 既存明細が変更されました: ID=${lineId}`,
        beforeSnap,
        afterSnap
      );
    }
  }

  console.log("  ------------------------------------------------------------");
  console.log(
    `  DB書類総数: ${dbDocsBefore.length}件 -> ${dbDocsAfter.length}件 (今回追加: +${dbDocsAfter.length - dbDocsBefore.length}原本)`
  );
  console.log(
    `  DB明細総数: ${totalExistingLinesBefore}行 -> ${totalLinesAfter}行 (今回追加: +${totalLinesAfter - totalExistingLinesBefore}行 [新規原本${insertedLinesCount}行 + 既存原本補完${appendedLinesCount}行])`
  );
  console.log(
    `  既存明細の変更件数: ${modifiedExistingLinesCount}件 (消失: ${missingExistingLinesCount}件)`
  );
  console.log(
    `  既存維持明細数: ${keptLinesCount}行 / 安全上保留(未取込)明細数: ${heldLinesCount}行`
  );
  console.log("  ------------------------------------------------------------");

  // 仕入先ごとに代表1行の金額と原本リンクを台帳と突合
  console.log("\n[Step 6] 仕入先別 代表1行の実DB vs 台帳突合:");
  const suppliers = ["オークネット", "KOMEHYO", "ネットジャパン"];
  for (const sup of suppliers) {
    const sampleExcelRow = adoptedPurchaseRows.find(
      (r) =>
        r.supplier_name === sup &&
        r.notes !== undefined &&
        dbDocsAfter.some(
          (d) =>
            d.document.drive_file_id === r.drive_file_id &&
            d.document.created_by === "excel-purchase-importer"
        )
    ) || adoptedPurchaseRows.find(
      (r) =>
        r.supplier_name === sup &&
        dbDocsAfter.some((d) => d.document.drive_file_id === r.drive_file_id)
    );
    if (!sampleExcelRow) continue;
    const dbEntry = dbDocsAfter.find(
      (d) => d.document.drive_file_id === sampleExcelRow.drive_file_id
    );
    const dbLine = dbEntry?.lines.find(
      (l) => l.reception_number_raw === sampleExcelRow.reception_number_raw
    );
    console.log(`  ■ 仕入先: ${sup}`);
    console.log(
      `    管理ID: ${sampleExcelRow.management_id} / ファイル名: ${sampleExcelRow.file_name} (DB Document ID: ${dbEntry?.document?.id})`
    );
    console.log(
      `    台帳  -> 受付番号:${sampleExcelRow.reception_number_raw}, 商品金額(税抜):${sampleExcelRow.item_amount}, 商品税:${sampleExcelRow.tax_amount}, 手数料:${sampleExcelRow.fee_amount}, 手数料税:${sampleExcelRow.fee_tax_amount}, 税込行合計:${sampleExcelRow.total_line_amount}, 原本URL:${sampleExcelRow.drive_file_url}`
    );
    console.log(
      `    実DB  -> 受付番号:${dbLine?.reception_number_raw}, 商品金額(税抜):${dbLine?.item_amount}, 商品税:${dbLine?.tax_amount}, 手数料:${dbLine?.fee_amount}, 手数料税:${dbLine?.fee_tax_amount}, 税込行合計:${dbLine?.total_line_amount}, 原本URL:${dbEntry?.document?.drive_file_url}`
    );
  }
}

main().catch((err) => {
  console.error("\n[FATAL ERROR]", err);
  process.exit(1);
});
