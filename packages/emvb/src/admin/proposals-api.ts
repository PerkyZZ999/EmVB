import { PLUGIN_ID } from "../constants.ts";
import type { Proposal } from "../core/proposals.ts";
import { requestJson, type Fetcher } from "./api.ts";

/** W-930: an agent proposal waiting for review, as the plugin-local route returns it. */
export type PendingProposal = { id: string; createdAt: string; proposal: Proposal };

const BASE = `/_emdash/api/plugins/${PLUGIN_ID}/proposals`;

/** The page's proposals, newest first. Damaged records are left out by the server. */
export async function listProposals(
  fetcher: Fetcher,
  collection: string,
  id: string,
): Promise<PendingProposal[]> {
  const data = await requestJson<{
    items?: { id: string; record: { proposal: Proposal; createdAt: string } }[];
  }>(fetcher, BASE, { method: "POST", body: { collection, id } });
  return (data.items ?? []).map((item) => ({
    id: item.id,
    createdAt: item.record.createdAt,
    proposal: item.record.proposal,
  }));
}

/** Removes a proposal once every change in it was accepted or rejected (or on Reject all). */
export async function withdrawProposal(
  fetcher: Fetcher,
  id: string,
  decision?: { accepted: number; rejected: number },
): Promise<void> {
  await requestJson(fetcher, `${BASE}/withdraw`, {
    method: "POST",
    body: decision ? { id, decision } : { id },
  });
}

/** Labels the newest saved version "Via agent" in the timeline. */
export async function recordAccepted(
  fetcher: Fetcher,
  collection: string,
  id: string,
  accepted: number,
): Promise<void> {
  await requestJson(fetcher, `${BASE}/accepted`, {
    method: "POST",
    body: { target: { collection, id }, accepted },
  });
}
