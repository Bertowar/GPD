
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ojnrtqejmnssmkgywufa.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qbnJ0cWVqbW5zc21rZ3l3dWZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQwNzQ3MDYsImV4cCI6MjA3OTY1MDcwNn0.ZAWjuazCvo3TeW7JYkZY0_JvGm_nhUyvg39ySDsZua0';

export const supabase = createClient(supabaseUrl, supabaseKey);
