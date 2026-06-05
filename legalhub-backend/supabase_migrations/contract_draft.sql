-- Contract Draft table for the AI Contract Drafting feature
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS contract_draft (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lawyer_id       UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    firm_id         UUID NOT NULL,
    case_id         UUID REFERENCES case_file(id) ON DELETE SET NULL,

    contract_type   VARCHAR(64)  NOT NULL,  -- bail, travail_cdi, nda, etc.
    lang            VARCHAR(8)   NOT NULL DEFAULT 'ar',   -- ar | fr | en
    country_code    VARCHAR(8)   NOT NULL DEFAULT 'TN',

    status          VARCHAR(32)  NOT NULL DEFAULT 'DRAFTING',
    -- DRAFTING → READY → REVIEW → FINALIZED

    answers         JSONB        NOT NULL DEFAULT '{}',   -- collected Q&A
    questions       JSONB        NOT NULL DEFAULT '[]',   -- current pending questions
    generated_text  TEXT,                                  -- full contract text
    risk_analysis   TEXT,                                  -- risk analysis report
    rag_sources     JSONB        DEFAULT '[]',             -- sources used for RAG
    pdf_url         TEXT,                                  -- Supabase Storage URL

    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_contract_draft_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contract_draft_updated_at
    BEFORE UPDATE ON contract_draft
    FOR EACH ROW EXECUTE FUNCTION update_contract_draft_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_contract_draft_firm    ON contract_draft(firm_id);
CREATE INDEX IF NOT EXISTS idx_contract_draft_lawyer  ON contract_draft(lawyer_id);
CREATE INDEX IF NOT EXISTS idx_contract_draft_status  ON contract_draft(status);
CREATE INDEX IF NOT EXISTS idx_contract_draft_created ON contract_draft(created_at DESC);

-- Row Level Security
ALTER TABLE contract_draft ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lawyers can manage their firm's drafts"
    ON contract_draft
    FOR ALL
    USING (
        firm_id = (
            SELECT firm_id FROM app_user WHERE id = auth.uid()
        )
    );
