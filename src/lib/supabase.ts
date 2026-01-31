import { createClient } from '@supabase/supabase-js';

// Public Supabase credentials (safe to expose in frontend)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hwnwemiqlmplcmznoack.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3bndlbWlxbG1wbGNtem5vYWNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4MzA2NjksImV4cCI6MjA4NTQwNjY2OX0.ZJrpPU6RWGgnozvW3eMnMbzYGgHJKT34nOvrWs8W8UE';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Channel for pixel updates broadcast
export const PIXEL_CHANNEL = 'pixel-updates';
