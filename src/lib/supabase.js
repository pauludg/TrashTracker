
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://jqmqzjmkqkpgepmwzxdp.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxbXF6am1rcWtwZ2VwbXd6eGRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU3NzQ1OTIsImV4cCI6MjA2MTM1MDU5Mn0.NZqE-Mg-Tv18L-SXrUvGFkuTN_bKg9u6YSABkGGwQ_o'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
