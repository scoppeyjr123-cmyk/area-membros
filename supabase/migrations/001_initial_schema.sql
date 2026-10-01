-- ==============================================================================
-- Migration: 001_initial_schema.sql
-- Descrição: Estrutura inicial do banco de dados (profiles, products, user_entitlements)
--            e políticas de segurança RLS (Row Level Security).
-- ==============================================================================

-- 1. TABELA DE PERFIS DE USUÁRIOS (profiles)
CREATE TABLE IF NOT EXISTS public.profiles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Habilitar RLS em profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para profiles:
-- Usuário autenticado pode ler apenas o próprio perfil
CREATE POLICY "Users can view own profile"
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING ((select auth.uid()) = user_id);

-- Usuário autenticado pode atualizar apenas o próprio perfil (nome, etc)
CREATE POLICY "Users can update own profile"
    ON public.profiles
    FOR UPDATE
    TO authenticated
    USING ((select auth.uid()) = user_id)
    WITH CHECK ((select auth.uid()) = user_id);


-- 2. TABELA DE PRODUTOS / MÓDULOS (products)
CREATE TABLE IF NOT EXISTS public.products (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- ex: 'library', 'bonus', 'bump'
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Habilitar RLS em products
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para products:
-- Todos os usuários autenticados podem visualizar a lista de produtos ativos
CREATE POLICY "Authenticated users can view active products"
    ON public.products
    FOR SELECT
    TO authenticated
    USING (active = true);


-- 3. TABELA DE PERMISSÕES / DIREITOS DO USUÁRIO (user_entitlements)
--
-- DECISÃO ARQUITETURAL:
-- Esta tabela representa o ESTADO ATUAL de acesso do usuário a cada produto,
-- e NÃO o histórico completo de compras/pagamentos.
--
-- Comportamento esperado:
--   • Primeira compra           → INSERT com status = 'active'
--   • Webhook repetido          → Não cria duplicata (UNIQUE user_id + product_code)
--                                 Pode fazer UPDATE idempotente no registro existente
--   • Reembolso / chargeback    → UPDATE status = 'revoked'
--   • Recompra posterior        → UPDATE status = 'active', purchase_id atualizado
--   • purchase_id               → Sempre reflete a compra mais recente que concedeu
--                                 ou revogou aquele acesso
--
-- O histórico completo de pagamentos e eventos será implementado futuramente
-- em uma tabela separada (purchases / purchase_events) durante a integração
-- com a Wiapy.
--
CREATE TABLE IF NOT EXISTS public.user_entitlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    product_code TEXT NOT NULL REFERENCES public.products(code) ON DELETE RESTRICT,
    status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
    source TEXT NOT NULL DEFAULT 'manual', -- ex: 'wiapy_webhook', 'manual', 'stripe'
    purchase_id TEXT, -- ID da compra/transação mais recente (externo: Wiapy, Stripe, etc.)
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Criar índice para buscas frequentes de direitos por usuário
CREATE INDEX IF NOT EXISTS idx_user_entitlements_user_id ON public.user_entitlements(user_id);

-- UNIQUE garante: um usuário possui no máximo UMA linha por produto.
-- Isso viabiliza idempotência nos webhooks e controle de estado (active/revoked).
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_entitlements_user_product ON public.user_entitlements(user_id, product_code);

-- Habilitar RLS em user_entitlements
ALTER TABLE public.user_entitlements ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para user_entitlements:
-- Usuário autenticado pode apenas CONSULTAR suas próprias permissões
CREATE POLICY "Users can view own entitlements"
    ON public.user_entitlements
    FOR SELECT
    TO authenticated
    USING ((select auth.uid()) = user_id);

-- NENHUMA política FOR INSERT, UPDATE ou DELETE é concedida ao role 'authenticated'.
-- Isso impede estritamente que usuários comuns concedam, alterem ou revoguem entitlements.
-- Apenas a chave SERVICE_ROLE (backend/webhooks/triggers) pode inserir/alterar/revogar.


-- 4. TRIGGER PARA CRIAÇÃO AUTOMÁTICA DE PERFIL AO CADASTRAR NO AUTH
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.profiles (user_id, email, name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
    )
    ON CONFLICT (user_id) DO UPDATE
    SET email = EXCLUDED.email,
        updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- 5. TRIGGER PARA ATUALIZAR UPDATED_AT
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_user_entitlements_updated_at
    BEFORE UPDATE ON public.user_entitlements
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- 6. POPULAR PRODUTOS BASELINE
INSERT INTO public.products (code, name, type, active) VALUES
    ('maps_150', '150 Mapas Visuais Principais', 'library', true),
    ('bonus_mercado_40', 'Bônus - Mercado de Trabalho 40+', 'bonus', true),
    ('bonus_pdf_sem_misterio', 'Bônus - PDFs sem Mistério', 'bonus', true),
    ('bonus_email_profissional', 'Bônus - E-mail Profissional', 'bonus', true),
    ('bonus_seguranca_digital', 'Bônus - Segurança Digital', 'bonus', true),
    ('bump_pix', 'Material Extra - Guia Pix Seguro', 'bump', true),
    ('bump_celular', 'Material Extra - Domine seu Celular', 'bump', true),
    ('bump_fotos_ia', 'Material Extra - Fotos com Inteligência Artificial', 'bump', true)
ON CONFLICT (code) DO UPDATE 
SET name = EXCLUDED.name,
    type = EXCLUDED.type,
    active = EXCLUDED.active;
