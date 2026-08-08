/* ============================================================
   Conexão com o Supabase (o banco + login + arquivos).
   As chaves entram só na Etapa 7, num arquivo .env.local que
   NUNCA vai para o GitHub (já está no .gitignore).
   Enquanto USAR_MOCK for true, este arquivo não é usado.
   ============================================================ */

import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseConfigurado = Boolean(url && key)

export const supabase = supabaseConfigurado ? createClient(url, key) : null
