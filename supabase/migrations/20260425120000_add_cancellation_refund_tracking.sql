ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS refund_status text DEFAULT 'none'
    CHECK (refund_status IN ('none', 'pending', 'refunded')),
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS refunded_by uuid REFERENCES parents(id);

CREATE INDEX IF NOT EXISTS idx_reservations_refund_status
  ON reservations (refund_status)
  WHERE refund_status = 'pending';
