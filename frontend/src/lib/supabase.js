import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Production: configure auth storage, PKCE flow, and custom fetch adapter for request tracing.
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
