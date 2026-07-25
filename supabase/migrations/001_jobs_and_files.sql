-- Migration 001: jobs, worker_agents, agent_files
-- Run this in the Supabase SQL editor if you already applied schema.sql

CREATE TABLE jobs (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  problem            TEXT        NOT NULL,
  worker_count       INTEGER     NOT NULL DEFAULT 1,
  deadline           TEXT,
  linq_phone         TEXT,
  status             TEXT        NOT NULL DEFAULT 'generating'
                                 CHECK (status IN ('generating', 'deploying', 'running', 'done', 'failed')),
  orchestrator_agent JSONB       NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE worker_agents (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id               UUID        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  worker_index         INTEGER     NOT NULL,
  subtask_title        TEXT        NOT NULL,
  config               JSONB       NOT NULL DEFAULT '{}',
  status               TEXT        NOT NULL DEFAULT 'pending'
                                   CHECK (status IN ('pending', 'in-progress', 'review', 'done', 'blocked')),
  linq_conversation_id TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE agent_files (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id           UUID        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  worker_agent_id  UUID        REFERENCES worker_agents(id) ON DELETE SET NULL,
  filename         TEXT        NOT NULL,
  file_type        TEXT        NOT NULL CHECK (file_type IN ('md', 'json')),
  content          TEXT        NOT NULL,
  size_label       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
