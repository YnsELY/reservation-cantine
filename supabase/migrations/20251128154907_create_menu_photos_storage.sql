/*
  # Create storage bucket for menu photos

  1. Storage Setup
    - Create a public bucket called 'menu-photos' for storing menu images
    - Enable public access for menu photos so they can be displayed without authentication

  2. Storage Policies
    - Allow authenticated users (providers) to upload menu photos
    - Allow public read access to all menu photos
    - Allow providers to update/delete their own menu photos
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('menu-photos', 'menu-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Providers can upload menu photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'menu-photos' AND
  auth.uid() IN (
    SELECT user_id FROM providers WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Anyone can view menu photos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'menu-photos');

CREATE POLICY "Providers can update their menu photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'menu-photos' AND
  auth.uid() IN (
    SELECT user_id FROM providers WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Providers can delete their menu photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'menu-photos' AND
  auth.uid() IN (
    SELECT user_id FROM providers WHERE user_id = auth.uid()
  )
);
