-- Litmus persistence.
--
-- Three layers, and every table belongs to exactly one:
--   identity — profile (mirrors Supabase auth.users)
--   history  — session, run (written once, never edited)
--   library  — course (edited freely; test_suite/style/note land post-launch)
--


-- One row per account, created by the trigger at the bottom of this file.
CREATE TABLE IF NOT EXISTS public.profile (
    user_id         UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
    email           TEXT,
    display_name    TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS public.style (
    style_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES public.profile(user_id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    description     TEXT,
    sample_code     TEXT,
    created_in_run  UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS public.course (
    course_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES public.profile(user_id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    code        TEXT,
    lecturer    TEXT,
    style_id    UUID REFERENCES public.style(style_id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------- history --

-- ONE problem. This is what the sidebar lists — a student thinks in problems,
-- not in tool invocations.
CREATE TABLE IF NOT EXISTS public.session (
    session_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES public.profile(user_id) ON DELETE CASCADE,
    course_id   UUID REFERENCES public.course(course_id) ON DELETE SET NULL,
    program_lang TEXT NOT NULL DEFAULT 'python' CHECK (program_lang IN ( 'python', 'java')),
    title       TEXT NOT NULL,
    problem     TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS public.test_suite (
    suite_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES public.profile(user_id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    description     TEXT,
    created_in_run  UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS public.test_case (
    case_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    suite_id        UUID NOT NULL REFERENCES public.test_suite(suite_id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    description     TEXT,
    body            TEXT NOT NULL,
    input           TEXT,
    expected        TEXT,
    position        INTEGER NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS public.run (
    run_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id   UUID NOT NULL REFERENCES public.session(session_id) ON DELETE CASCADE,
    mode         TEXT NOT NULL CHECK (mode IN ('tutor', 'verifier')),
    blueprint    JSONB,
    tests_used   TEXT,
    style_used   TEXT,
    suite_id     UUID REFERENCES public.test_suite(suite_id) ON DELETE SET NULL,
    style_id     UUID REFERENCES public.style(style_id) ON DELETE SET NULL,
    transcript   JSONB,
    attempts     JSONB,
    -- Tutor only: what the student wrote themselves.
    student_code TEXT,
    -- What they walked away with. TEXT — it is source code, not structured data.
    final_code   TEXT,
    --later feature
    mistakes     JSONB,
    outcome      TEXT CHECK (outcome IN ('passed', 'failed', 'abandoned')),
    tests_passed INTEGER,
    tests_total  INTEGER,

    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $fk$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'test_suite_created_in_run_fkey') THEN
        ALTER TABLE public.test_suite
            ADD CONSTRAINT test_suite_created_in_run_fkey
            FOREIGN KEY (created_in_run) REFERENCES public.run(run_id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'style_created_in_run_fkey') THEN
        ALTER TABLE public.style
            ADD CONSTRAINT style_created_in_run_fkey
            FOREIGN KEY (created_in_run) REFERENCES public.run(run_id) ON DELETE SET NULL;
    END IF;
END
$fk$;


-- The sidebar query, verbatim — and the same index the guest wall counts on.
CREATE INDEX IF NOT EXISTS idx_session_user ON public.session (user_id, updated_at DESC);
-- Each user is restricted to one title per style no styles must share the sasme title 
CREATE UNIQUE INDEX IF NOT EXISTS idx_style_user_title ON public.style (user_id, title);
-- Every read of a session pulls its runs in order.
CREATE INDEX IF NOT EXISTS idx_run_session ON public.run (session_id, created_at);
-- The library lists: a user's saved suites and styles.
CREATE INDEX IF NOT EXISTS idx_test_suite_user ON public.test_suite (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_style_user ON public.style (user_id, created_at DESC);
-- Rendering a suite reads its cases in display order.
CREATE INDEX IF NOT EXISTS idx_test_case_suite ON public.test_case (suite_id, position);

-- --------------------------------------------------------------------- RLS --

ALTER TABLE public.profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.run     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_suite   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_case    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.style        ENABLE ROW LEVEL SECURITY;



CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.profile (user_id, email, display_name)
    -- NEW is an auth.users row, so these are ITS column names: id, email,
    -- raw_user_meta_data. OAuth providers put a name in that JSON; email signup
    -- leaves it absent, which is why display_name is nullable.
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data ->> 'full_name')
    
    ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
    END;
$$;

CREATE OR REPLACE TRIGGER auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW 
    EXECUTE FUNCTION public.handle_new_user();



CREATE OR REPLACE FUNCTION public.handle_user_updated()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.profile
    SET email        = NEW.email,
        display_name = COALESCE(NEW.raw_user_meta_data ->> 'full_name', display_name)
    WHERE user_id = NEW.id;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER auth_user_updated
    AFTER UPDATE ON auth.users
    FOR EACH ROW
    WHEN (OLD.email IS DISTINCT FROM NEW.email
          OR OLD.raw_user_meta_data IS DISTINCT FROM NEW.raw_user_meta_data)
    EXECUTE FUNCTION public.handle_user_updated();
