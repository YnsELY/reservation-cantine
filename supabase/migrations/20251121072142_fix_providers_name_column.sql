/*
  # Fix Providers Table Name Column

  1. Changes
    - Make the `name` column nullable in providers table
    - This allows providers to use `company_name` instead
  
  2. Reason
    - The original providers table had a `name` column that was required
    - We added `company_name` for authentication
    - Need to make `name` optional to avoid conflicts
*/

-- Make name column nullable
ALTER TABLE providers ALTER COLUMN name DROP NOT NULL;