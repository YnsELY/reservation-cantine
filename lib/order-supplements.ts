export interface OrderSupplement {
  id?: string;
  name: string;
  price?: number;
  quantity: number;
}

export interface SupplementAggregate {
  name: string;
  quantity: number;
}

const getPositiveQuantity = (value: unknown) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 1;
};

const asObject = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
};

const parseStringValue = (value: string): OrderSupplement[] => {
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed !== trimmed) {
      return parseOrderSupplements(parsed);
    }
  } catch {
    // Legacy rows may contain a plain supplement label instead of JSON.
  }

  return [{ name: trimmed, quantity: 1 }];
};

export const parseOrderSupplements = (value: unknown): OrderSupplement[] => {
  if (!value) {
    return [];
  }

  if (typeof value === 'string') {
    return parseStringValue(value);
  }

  if (Array.isArray(value)) {
    return value.flatMap(item => parseOrderSupplements(item));
  }

  const objectValue = asObject(value);
  if (!objectValue) {
    return [];
  }

  if (Array.isArray(objectValue.items)) {
    return parseOrderSupplements(objectValue.items);
  }

  const rawName = objectValue.name ?? objectValue.label ?? objectValue.title;
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  if (!name) {
    return [];
  }

  const rawPrice = objectValue.price;
  const price = Number(rawPrice);
  const rawQuantity = objectValue.quantity ?? objectValue.qty ?? objectValue.count;

  return [{
    id: typeof objectValue.id === 'string' ? objectValue.id : undefined,
    name,
    price: Number.isFinite(price) ? price : undefined,
    quantity: getPositiveQuantity(rawQuantity),
  }];
};

export const aggregateOrderSupplements = (values: unknown[]): SupplementAggregate[] => {
  const aggregateMap = new Map<string, SupplementAggregate>();

  values.flatMap(value => parseOrderSupplements(value)).forEach((supplement) => {
    const key = supplement.name.trim().toLocaleLowerCase('fr-FR');
    if (!key) {
      return;
    }

    const existing = aggregateMap.get(key);
    if (existing) {
      existing.quantity += supplement.quantity;
      return;
    }

    aggregateMap.set(key, {
      name: supplement.name.trim(),
      quantity: supplement.quantity,
    });
  });

  return Array.from(aggregateMap.values()).sort((a, b) => {
    if (b.quantity !== a.quantity) {
      return b.quantity - a.quantity;
    }

    return a.name.localeCompare(b.name, 'fr-FR');
  });
};

export const getSupplementAggregateTotal = (aggregates: SupplementAggregate[]) => (
  aggregates.reduce((total, supplement) => total + supplement.quantity, 0)
);

export const formatSupplementAggregate = (supplement: SupplementAggregate) => (
  `${supplement.quantity} × ${supplement.name}`
);
