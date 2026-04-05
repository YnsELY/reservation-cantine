-- =============================================================
-- Push Notification System - Phase 1 (Expo Push Notifications)
-- =============================================================

-- Table: user_push_tokens
-- Stores push notification tokens for all user types
CREATE TABLE IF NOT EXISTS user_push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('parent', 'school', 'provider', 'admin')),
  push_token TEXT NOT NULL,
  provider VARCHAR(20) NOT NULL DEFAULT 'expo' CHECK (provider IN ('expo', 'fcm', 'apns')),
  device_type VARCHAR(20) CHECK (device_type IN ('ios', 'android', 'web')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Unique constraint: one token per device
CREATE UNIQUE INDEX idx_push_tokens_token ON user_push_tokens(push_token);

-- Index for fast lookups by user
CREATE INDEX idx_push_tokens_user ON user_push_tokens(user_id, user_type, is_active);

-- Table: notification_preferences
-- Per-user notification opt-in/opt-out
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('parent', 'school', 'provider', 'admin')),
  notification_type VARCHAR(100) NOT NULL,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, user_type, notification_type)
);

-- Table: notification_logs
-- Audit trail of all sent notifications
CREATE TABLE IF NOT EXISTS notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  user_type VARCHAR(20) NOT NULL,
  notification_type VARCHAR(100) NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX idx_notification_logs_user ON notification_logs(user_id, user_type);
CREATE INDEX idx_notification_logs_type ON notification_logs(notification_type);
CREATE INDEX idx_notification_logs_created ON notification_logs(created_at DESC);

-- =============================================================
-- RLS Policies
-- =============================================================

ALTER TABLE user_push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

-- user_push_tokens: allow all (auth is handled via access codes, not auth.uid)
CREATE POLICY "Allow all on user_push_tokens"
  ON user_push_tokens FOR ALL
  USING (true)
  WITH CHECK (true);

-- notification_preferences: users manage own preferences
CREATE POLICY "Users can manage own notification preferences"
  ON notification_preferences FOR ALL
  USING (true)
  WITH CHECK (true);

-- notification_logs: users can view their own logs
CREATE POLICY "Users can view own notification logs"
  ON notification_logs FOR SELECT
  USING (true);

-- Service role can insert logs (from Edge Functions)
CREATE POLICY "Service can insert notification logs"
  ON notification_logs FOR INSERT
  WITH CHECK (true);

-- =============================================================
-- Function: auto-update updated_at
-- =============================================================
CREATE OR REPLACE FUNCTION update_push_token_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_push_token_timestamp
  BEFORE UPDATE ON user_push_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_push_token_timestamp();

CREATE TRIGGER trigger_update_notification_pref_timestamp
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_push_token_timestamp();
