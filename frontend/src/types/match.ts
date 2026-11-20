/*
 * /match shapes. Mirror backend/app/schemas/match.py; the flow and the rules are in
 * docs/architecture.md "Match API".
 */
import type { ModelSpec } from '@/features/match/embedding/protocol';

export type EmbeddingsMode = 'client' | 'server' | 'off';

export type MatchConfig = {
  embeddings: EmbeddingsMode;
  /** What the browser loads; client mode only. */
  model: ModelSpec | null;
  max_jd_chars: number;
  max_resume_chunks: number;
  max_jd_chunks: number;
};

export type MatchPrepared = {
  model: ModelSpec;
  /** Sent back with the vectors: proves they're for the chunks the server derives. */
  digest: string;
  jd_chunks: string[];
  resume_chunks: string[];
};

export type ClientEmbeddings = {
  digest: string;
  /** base64 of little-endian float32, row-major, one row per chunk. */
  jd: string;
  resume: string;
};

export type MatchInput = {
  resume_id: string;
  jd_text: string;
  application_id?: string | null;
};

export type SkillRequirement = {
  /** Any one meets it. */
  skills: string[];
  /** "Python", "FastAPI, Django or Flask". */
  label: string;
  /** false: a nice-to-have. */
  required: boolean;
};

export type EvidencePair = {
  jd_text: string;
  resume_text: string;
  /** Raw cosine; only meaningful relative to the other pairs. */
  similarity: number;
};

export type MatchSummary = {
  id: string;
  /** 0–100. */
  score: number;
  resume_version_id: string;
  resume_label: string;
  application_id: string | null;
  company: string | null;
  role_title: string | null;
  /** The JD's first line, shortened. */
  jd_excerpt: string;
  /** Scored with today's model and versions; older results offer a re-run. */
  is_current: boolean;
  created_at: string;
};

export type Match = MatchSummary & {
  jd_text: string;
  /** 0–1; null when the JD named no known skills (the score is semantic only). */
  skill_coverage: number | null;
  /** 0–1, calibrated. */
  semantic_score: number;
  matched_skills: SkillRequirement[];
  missing_skills: SkillRequirement[];
  suggested_keywords: string[];
  evidence: EvidencePair[];
  /** false: the JD didn't say what's required and what's a nice-to-have. */
  sections_detected: boolean;
  model_name: string;
  scoring_version: number;
  calibration_version: number;
  taxonomy_version: number;
};
