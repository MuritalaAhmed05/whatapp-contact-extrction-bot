-- Run this entire script in your Supabase SQL Editor

-- Drop the old table if it exists
DROP TABLE IF EXISTS recent_extractions;

-- Create the new table
CREATE TABLE recent_extractions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number TEXT NOT NULL,
  file_id TEXT NOT NULL,
  group_name TEXT NOT NULL,
  contact_count INT NOT NULL,
  date TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Allow public access for the Next.js frontend to read/write using the Anon Key
ALTER TABLE recent_extractions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read/write" ON recent_extractions FOR ALL USING (true) WITH CHECK (true);
