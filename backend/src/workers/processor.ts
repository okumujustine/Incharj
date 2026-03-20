import type { Job } from "bullmq";
import { pool, query } from "../db";
import { getConnectorProvider } from "../connectors/registry";
import { decryptCredentials, encryptCredentials, sha256 } from "../utils/security";
import { SQL_UPDATE_CONNECTOR_AFTER_SYNC, SQL_SET_CONNECTOR_ERROR } from "../sql/connectors";
import {
  SQL_COMPLETE_SYNC_JOB,
  SQL_COMPLETE_SYNC_JOB_IF_FINISHED,
  SQL_COUNT_CONNECTOR_DOCS,
  SQL_FAIL_SYNC_JOB,
  SQL_FAIL_SYNC_JOB_CONNECTOR_NOT_FOUND,
  SQL_INCREMENT_SYNC_JOB_DOC_RESULT,
  SQL_SELECT_CONNECTOR_FOR_SYNC,
  SQL_SELECT_SYNC_JOB_PROGRESS,
  SQL_SET_SYNC_JOB_ENQUEUED,
  SQL_START_SYNC_JOB,
} from "../sql/sync-jobs";
import { documentQueue, syncQueue } from "./queue";
import { SQL_SELECT_CONNECTOR_CHECKPOINT, SQL_UPSERT_CONNECTOR_CHECKPOINT } from "../sql/checkpoints";
import { createLogger } from "../utils/logger";
import {
  CHUNKING_VERSION,
  EXTRACTION_VERSION,
  INDEXING_VERSION,
  type CanonicalDocumentEnvelope,
} from "../types/document-envelope";
import { ingestCanonicalDocument } from "../services/indexer";
import { SyncErrorCode, SyncPipelineError, toSyncPipelineError } from "../types/sync-errors";
import type { ConnectorDocumentRef } from "../connectors/plugin-types";

const log = createLogger("sync-processor");

export interface EnumerateJobData {
  syncJobId: string;
  connectorId: string;
}

export interface DocumentJobData {
  syncJobId: string;
  connectorId: string;
  ref: ConnectorDocumentRef;
}

export interface FinalizeJobData {
  syncJobId: string;
  connectorId: string;
  checkpoint: Record<string, unknown> | null;
  encryptedCredentials: string | null;
}

async function loadConnectorModel(connectorId: string) {
  const connectorResult = await query<{
    id: string;
    org_id: string;
    kind: string;
    credentials: string | null;
    config: Record<string, unknown> | null;
    last_synced_at: string | null;
    sync_cursor: string | null;
  }>(SQL_SELECT_CONNECTOR_FOR_SYNC, [connectorId]);

  return connectorResult.rows[0] ?? null;
}

function shouldRetry(error: SyncPipelineError, job: Job): boolean {
  const maxAttempts = job.opts.attempts ?? 1;
  return error.retriable && job.attemptsMade + 1 < maxAttempts;
}

function envelopeFromRef(options: {
  orgId: string;
  connectorId: string;
  connectorKey: string;
  ref: ConnectorDocumentRef;
  content: string | null;
  extractionStatus: "succeeded" | "failed" | "empty";
  extractionErrorCode: string | null;
  metadata?: Record<string, unknown>;
}): CanonicalDocumentEnvelope {
  const content = options.content;
  const checksum = sha256(`${options.ref.title ?? ""}::${content ?? ""}`);

  return {
    orgId: options.orgId,
    connectorId: options.connectorId,
    connectorKey: options.connectorKey,
    sourceId: options.connectorId,
    externalId: options.ref.externalId,
    url: options.ref.url,
    title: options.ref.title,
    kind: options.ref.kind,
    ext: options.ref.ext,
    content,
    contentType: options.ref.contentType,
    sourcePath: options.ref.sourcePath,
    sourceLastModifiedAt: options.ref.sourceLastModifiedAt,
    authorName: options.ref.authorName,
    authorEmail: options.ref.authorEmail,
    checksum,
    sourcePermissions: options.ref.sourcePermissions,
    extractionStatus: options.extractionStatus,
    extractionErrorCode: options.extractionErrorCode,
    extractionVersion: EXTRACTION_VERSION,
    chunkingVersion: CHUNKING_VERSION,
    indexingVersion: INDEXING_VERSION,
    metadata: {
      ...options.ref.metadata,
      ...(options.metadata ?? {}),
    },
  };
}

export async function processEnumerateJob(data: EnumerateJobData): Promise<void> {
  const { syncJobId, connectorId } = data;
  await query(SQL_START_SYNC_JOB, [syncJobId]);

  const connectorModel = await loadConnectorModel(connectorId);
  if (!connectorModel) {
    await query(SQL_FAIL_SYNC_JOB_CONNECTOR_NOT_FOUND, [syncJobId]);
    return;
  }

  const provider = getConnectorProvider(connectorModel.kind);
  const plugin = provider.plugin;

  try {
    let credentials = connectorModel.credentials
      ? decryptCredentials(connectorModel.credentials)
      : {};

    if (provider.auth.refreshCredentials) {
      const refreshed = await provider.auth.refreshCredentials(credentials);
      if (refreshed) credentials = refreshed;
    }

    const validatedConfig = plugin.validateConfig(connectorModel.config ?? {});

    const checkpointResult = await query<{ checkpoint: Record<string, unknown> | null }>(
      SQL_SELECT_CONNECTOR_CHECKPOINT,
      [connectorId]
    );
    const checkpoint = checkpointResult.rows[0]?.checkpoint ?? null;

    const enumeration = await plugin.enumerate({
      connectorId: connectorModel.id,
      orgId: connectorModel.org_id,
      credentials,
      config: validatedConfig,
      checkpoint,
    });

    const refs = enumeration.refs;

    await query(SQL_SET_SYNC_JOB_ENQUEUED, [
      syncJobId,
      refs.length,
      JSON.stringify(enumeration.nextCheckpoint),
      JSON.stringify({
        documents_enumerated: enumeration.refs.length,
        documents_capped: refs.length,
        documents_truncated: 0,
        document_limit_applied:
          typeof validatedConfig.max_documents === "number" && validatedConfig.max_documents > 0
            ? validatedConfig.max_documents
            : null,
      }),
    ]);

    const retryPolicy = provider.manifest.retryPolicy;
    for (let index = 0; index < refs.length; index += 1) {
      const ref = refs[index];
      await documentQueue.add(
        "sync-document",
        { syncJobId, connectorId, ref } as DocumentJobData,
        {
          jobId: `sync-document-${syncJobId}-${index}`,
          attempts: retryPolicy.maxAttempts,
          backoff: { type: retryPolicy.strategy, delay: retryPolicy.backoffMs },
          removeOnComplete: true,
        }
      );
    }

    const encryptedCredentials = connectorModel.credentials
      ? encryptCredentials(credentials)
      : null;

    await syncQueue.add(
      "sync-finalize",
      {
        syncJobId,
        connectorId,
        checkpoint: enumeration.nextCheckpoint,
        encryptedCredentials,
      } as FinalizeJobData,
      {
        jobId: `sync-finalize-${syncJobId}`,
        delay: 1_000,
      }
    );
  } catch (error) {
    const syncError = toSyncPipelineError(error, "enumeration");
    await query(SQL_SET_CONNECTOR_ERROR, [connectorModel.id, `${syncError.code}: ${syncError.message}`]);
    await query(SQL_FAIL_SYNC_JOB, [syncJobId, `${syncError.code}: ${syncError.message}`]);
    throw error;
  }
}

export async function processDocumentJob(data: DocumentJobData, job: Job): Promise<void> {
  const { syncJobId, connectorId, ref } = data;
  const connectorModel = await loadConnectorModel(connectorId);
  if (!connectorModel) {
    await query(SQL_INCREMENT_SYNC_JOB_DOC_RESULT, [syncJobId, 0, 0, 1]);
    return;
  }

  const provider = getConnectorProvider(connectorModel.kind);
  const plugin = provider.plugin;
  const validatedConfig = plugin.validateConfig(connectorModel.config ?? {});
  let credentials = connectorModel.credentials
    ? decryptCredentials(connectorModel.credentials)
    : {};

  if (provider.auth.refreshCredentials) {
    const refreshed = await provider.auth.refreshCredentials(credentials);
    if (refreshed) credentials = refreshed;
  }

  try {
    const fetched = await plugin.fetchDocument({
      connectorId: connectorModel.id,
      orgId: connectorModel.org_id,
      credentials,
      config: validatedConfig,
      ref,
    });

    const extractionStatus = fetched.content?.trim()
      ? "succeeded"
      : "empty";

    const envelope = envelopeFromRef({
      orgId: connectorModel.org_id,
      connectorId: connectorModel.id,
      connectorKey: provider.manifest.key,
      ref,
      content: fetched.content,
      extractionStatus,
      extractionErrorCode: extractionStatus === "empty" ? SyncErrorCode.EmptyContent : null,
      metadata: fetched.metadata,
    });

    const ingestionClient = await pool.connect();
    try {
      await ingestionClient.query("BEGIN");
      const outcome = await ingestCanonicalDocument(ingestionClient, envelope);
      await ingestionClient.query("COMMIT");

      if (outcome === "indexed") {
        await query(SQL_INCREMENT_SYNC_JOB_DOC_RESULT, [syncJobId, 1, 0, 0]);
      } else {
        await query(SQL_INCREMENT_SYNC_JOB_DOC_RESULT, [syncJobId, 0, 1, 0]);
      }
    } catch (ingestError) {
      await ingestionClient.query("ROLLBACK");
      const syncError = toSyncPipelineError(
        new SyncPipelineError({
          code: SyncErrorCode.IndexingFailed,
          stage: "index",
          message: ingestError instanceof Error ? ingestError.message : "Indexing failed",
          retriable: true,
          cause: ingestError,
        }),
        "index"
      );

      if (shouldRetry(syncError, job)) {
        throw syncError;
      }

      await query(SQL_INCREMENT_SYNC_JOB_DOC_RESULT, [syncJobId, 0, 0, 1]);
      log.error(
        { syncJobId, connectorId, externalId: ref.externalId, err: syncError, code: syncError.code },
        "document indexing failed"
      );
    } finally {
      ingestionClient.release();
    }
  } catch (error) {
    const syncError = toSyncPipelineError(error, "fetch");
    if (shouldRetry(syncError, job)) {
      throw syncError;
    }

    const errorEnvelope = envelopeFromRef({
      orgId: connectorModel.org_id,
      connectorId: connectorModel.id,
      connectorKey: provider.manifest.key,
      ref,
      content: null,
      extractionStatus: "failed",
      extractionErrorCode: syncError.code,
      metadata: {
        error: syncError.message,
      },
    });

    const ingestionClient = await pool.connect();
    try {
      await ingestionClient.query("BEGIN");
      await ingestCanonicalDocument(ingestionClient, errorEnvelope);
      await ingestionClient.query("COMMIT");
    } catch {
      await ingestionClient.query("ROLLBACK");
    } finally {
      ingestionClient.release();
    }

    await query(SQL_INCREMENT_SYNC_JOB_DOC_RESULT, [syncJobId, 0, 0, 1]);
    log.error(
      { syncJobId, connectorId, externalId: ref.externalId, err: syncError, code: syncError.code },
      "document fetch/normalize failed"
    );
  }
}

export async function processFinalizeJob(data: FinalizeJobData): Promise<void> {
  const { syncJobId, connectorId, checkpoint, encryptedCredentials } = data;
  const progressResult = await query<{
    status: string;
    docs_enqueued: number;
    docs_processed: number;
    docs_indexed: number;
    docs_skipped: number;
    docs_errored: number;
  }>(SQL_SELECT_SYNC_JOB_PROGRESS, [syncJobId]);

  const progress = progressResult.rows[0];
  if (!progress) {
    return;
  }

  if (progress.status === "failed") {
    return;
  }

  if (progress.docs_processed < progress.docs_enqueued) {
    await syncQueue.add(
      "sync-finalize",
      data,
      {
        jobId: `sync-finalize-${syncJobId}-${Date.now()}`,
        delay: 2_000,
        removeOnComplete: true,
      }
    );
    return;
  }

  if (progress.docs_enqueued === 0) {
    await query(SQL_COMPLETE_SYNC_JOB, [syncJobId, 0, 0, 0]);
  } else {
    await query(SQL_COMPLETE_SYNC_JOB_IF_FINISHED, [syncJobId]);
  }

  const connectorModel = await loadConnectorModel(connectorId);
  if (!connectorModel) return;

  await query(SQL_UPSERT_CONNECTOR_CHECKPOINT, [
    connectorId,
    connectorModel.org_id,
    JSON.stringify(checkpoint),
    syncJobId,
  ]);

  const totalDocsResult = await query<{ count: string }>(SQL_COUNT_CONNECTOR_DOCS, [connectorId]);
  const totalDocs = parseInt(totalDocsResult.rows[0]?.count ?? "0", 10);

  await query(SQL_UPDATE_CONNECTOR_AFTER_SYNC, [
    connectorId,
    encryptedCredentials,
    checkpoint ? JSON.stringify(checkpoint) : null,
    totalDocs,
  ]);
}
