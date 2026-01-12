-- Migration: Ajouter la table pending_payments pour l'intégration PayZone
-- Cette table stocke les paiements en attente avant confirmation par le callback PayZone

CREATE TABLE IF NOT EXISTS pending_payments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id TEXT UNIQUE NOT NULL,
    charge_id TEXT,
    parent_id UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
    cart_items JSONB NOT NULL,
    total_amount DECIMAL(10, 2) NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded', 'expired')),
    payzone_transaction_id TEXT,
    payzone_status TEXT,
    failure_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    refunded_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 minutes')
);

-- Index pour les recherches fréquentes
CREATE INDEX idx_pending_payments_order_id ON pending_payments(order_id);
CREATE INDEX idx_pending_payments_parent_id ON pending_payments(parent_id);
CREATE INDEX idx_pending_payments_status ON pending_payments(status);
CREATE INDEX idx_pending_payments_created_at ON pending_payments(created_at);

-- RLS pour la sécurité
ALTER TABLE pending_payments ENABLE ROW LEVEL SECURITY;

-- Politique: Les parents peuvent voir leurs propres paiements en attente
CREATE POLICY "Parents can view own pending payments"
    ON pending_payments
    FOR SELECT
    USING (
        parent_id IN (
            SELECT id FROM parents WHERE user_id = auth.uid()
        )
    );

-- Politique: Seul le service peut insérer/modifier (via service_role)
CREATE POLICY "Service can manage pending payments"
    ON pending_payments
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Fonction pour nettoyer les paiements expirés
CREATE OR REPLACE FUNCTION cleanup_expired_pending_payments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE pending_payments
    SET status = 'expired'
    WHERE status = 'pending'
    AND expires_at < NOW();
END;
$$;

-- Commentaires
COMMENT ON TABLE pending_payments IS 'Stocke les paiements en attente de confirmation PayZone';
COMMENT ON COLUMN pending_payments.order_id IS 'ID unique de commande généré par notre système';
COMMENT ON COLUMN pending_payments.charge_id IS 'ID de charge envoyé à PayZone';
COMMENT ON COLUMN pending_payments.cart_items IS 'Snapshot des articles du panier au moment du paiement';
COMMENT ON COLUMN pending_payments.payzone_transaction_id IS 'ID de transaction retourné par PayZone';
COMMENT ON COLUMN pending_payments.payzone_status IS 'Statut retourné par PayZone (CHARGED, DECLINED, etc.)';
