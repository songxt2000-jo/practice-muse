CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile" ON public.profiles FOR ALL TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  composer text,
  storage_path text,
  page_count integer NOT NULL DEFAULT 0,
  scan_status text NOT NULL DEFAULT 'pending',
  cover_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.books TO authenticated;
GRANT ALL ON public.books TO service_role;
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own books" ON public.books FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER books_touch BEFORE UPDATE ON public.books FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.pieces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id uuid REFERENCES public.books(id) ON DELETE CASCADE,
  title text NOT NULL,
  composer text,
  era text,
  mood text,
  story text,
  background text,
  key_signature text,
  default_tempo integer NOT NULL DEFAULT 90,
  start_page integer,
  end_page integer,
  abc_notation text,
  transcribe_status text NOT NULL DEFAULT 'pending',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pieces TO authenticated;
GRANT ALL ON public.pieces TO service_role;
ALTER TABLE public.pieces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own pieces" ON public.pieces FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER pieces_touch BEFORE UPDATE ON public.pieces FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX pieces_book_idx ON public.pieces(book_id, sort_order);

CREATE TABLE public.practice_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  total_seconds integer NOT NULL DEFAULT 0,
  piece_count integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.practice_sessions TO authenticated;
GRANT ALL ON public.practice_sessions TO service_role;
ALTER TABLE public.practice_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sessions" ON public.practice_sessions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.practice_session_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.practice_sessions(id) ON DELETE CASCADE,
  piece_id uuid REFERENCES public.pieces(id) ON DELETE SET NULL,
  piece_title text,
  seconds integer NOT NULL DEFAULT 0,
  tempo integer,
  loop_from integer,
  loop_to integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.practice_session_items TO authenticated;
GRANT ALL ON public.practice_session_items TO service_role;
ALTER TABLE public.practice_session_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own session items" ON public.practice_session_items FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX psi_session_idx ON public.practice_session_items(session_id);

CREATE POLICY "own score files read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'scores' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "own score files insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'scores' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "own score files update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'scores' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "own score files delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'scores' AND auth.uid()::text = (storage.foldername(name))[1]);