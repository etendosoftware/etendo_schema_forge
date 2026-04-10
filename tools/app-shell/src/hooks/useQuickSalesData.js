import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/auth/AuthContext.jsx';

// -- Helpers ------------------------------------------------------------------

function guessCategory(name) {
  const n = (name || '').toLowerCase();
  if (/cerveza|vino|agua|zumo|refresco|bebida|juice|beer|wine|water/i.test(n)) return 'Beverages';
  if (/aceite|jamón|queso|pan|carne|pescado|fruta|verdura|food|oil|ham|cheese|bread/i.test(n)) return 'Food';
  if (/mouse|keyboard|teclado|cable|monitor|tablet|laptop|usb/i.test(n)) return 'Electronics';
  if (/cafetera|tostadora|batidora|horno|appliance/i.test(n)) return 'Appliances';
  if (/libreta|bolígrafo|papel|carpeta|office|pen|notebook/i.test(n)) return 'Office';
  return 'Other';
}

function buildAuthHeaders(token) {
  return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function fetchJSON(url, headers) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function parseSelectorItems(data) {
  return data?.items || data?.response?.data || (Array.isArray(data) ? data : []);
}

function parseEntityRows(data) {
  return data?.response?.data || (Array.isArray(data) ? data : []);
}

// -- API fetching -------------------------------------------------------------

const STATUS_MAP = { CO: 'delivered', DR: 'draft', IP: 'in-progress', VO: 'voided' };

async function loadFromAPI(soBase, headers) {
  // Fetch catalogs (required) independently
  const [productsRes, customersRes, taxRes, uomRes] = await Promise.all([
    fetchJSON(`${soBase}/lines/selectors/M_Product_ID?limit=200`, headers),
    fetchJSON(`${soBase}/header/selectors/C_BPartner_ID?limit=200`, headers),
    fetchJSON(`${soBase}/lines/selectors/C_Tax_ID?limit=50`, headers),
    fetchJSON(`${soBase}/lines/selectors/C_UOM_ID?limit=50`, headers),
  ]);

  // Build lookup maps
  const rawTaxes = parseSelectorItems(taxRes);
  const rawUOMs = parseSelectorItems(uomRes);
  const defaultTax = rawTaxes.find(t => (t.name || t.label || '').includes('21')) || rawTaxes[0];
  const defaultTaxRate = (defaultTax?.rate || 21) / 100;
  const uomMap = Object.fromEntries(rawUOMs.map(u => [u.id, u.name || u.label || 'Unit']));

  // Map products
  const rawProducts = parseSelectorItems(productsRes);
  const seen = new Set();
  const products = [];
  for (const p of rawProducts) {
    const price = Number(p.price ?? p.priceList ?? p.standardPrice ?? p.pricePO ?? 0) || 0;
    const taxRate = p.taxRate != null ? Number(p.taxRate) / 100 : defaultTaxRate;
    const key = `${p.id}_${price}`;
    if (seen.has(key)) continue;
    seen.add(key);
    products.push({
      id: `${p.id}_${price}`,
      productId: p.id,
      searchKey: (p.searchKey || p.value || p.id || '').toUpperCase(),
      name: p.label || p.name || p._identifier || p.id || '—',
      category: p.category || guessCategory(p.label || p.name || ''),
      price,
      taxRate,
      uom: uomMap[p.uomId || p.C_UOM_ID] || p.uom || 'Unit',
      stock: p.qtyOnHand != null ? Number(p.qtyOnHand) : null,
      priceListVersion: p.priceListVersion || '',
    });
  }

  // Map customers — include a synthetic anonymous entry first
  const rawCustomers = parseSelectorItems(customersRes);
  const customers = [
    { id: 'anonymous', name: 'Anonymous Customer', isAnonymous: true, taxId: '', email: '', phone: '' },
    ...rawCustomers.map(bp => ({
      id: bp.id,
      name: bp.label || bp.name || bp._identifier || bp.id,
      taxId: bp.taxID || bp.taxId || '',
      email: bp.email || '',
      phone: bp.phone || '',
    })),
  ];

  // Fetch previous completed orders (best-effort)
  let previousOrders = [];
  let customerPriceLists = {};
  try {
    const headersRes = await fetchJSON(
      `${soBase}/header?_sortBy=creationDate desc&_startRow=0&_endRow=19&documentStatus=CO`,
      headers,
    );
    const rawHeaders = parseEntityRows(headersRes).filter(h => h.documentStatus === 'CO');

    // Build customer -> priceList mapping from order headers
    for (const h of rawHeaders) {
      const bpId = h.businessPartner || h.C_BPartner_ID;
      const plName = h['priceList$_identifier'] || '';
      if (bpId && plName) customerPriceLists[bpId] = plName;
    }

    const ordersWithLines = await Promise.all(
      rawHeaders.slice(0, 10).map(async (h) => {
        const bpId = h.businessPartner || h.C_BPartner_ID || null;
        const bpName = h['businessPartner$_identifier'] || '';
        try {
          const linesData = await fetchJSON(`${soBase}/lines?parentId=${h.id}`, headers);
          const rawLines = parseEntityRows(linesData);
          return {
            id: h.id,
            documentNo: h.documentNo || h.id,
            date: h.orderDate || h.creationDate || '',
            customerId: bpId,
            customerName: bpName,
            status: STATUS_MAP[h.documentStatus] || h.documentStatus || 'delivered',
            total: h.grandTotalAmount || 0,
            lines: rawLines.map(l => {
              const qty = l.orderedQuantity || l.QtyOrdered || 1;
              const rawPrice = l.priceActual ?? l.unitPrice ?? null;
              const unitPrice = rawPrice != null
                ? Number(rawPrice)
                : (qty > 0 ? (l.lineNetAmount || 0) / qty : 0);
              return {
                productId: l.product || l.M_Product_ID || '',
                name: l['product$_identifier'] || '',
                qty,
                unitPrice,
              };
            }),
          };
        } catch {
          return null;
        }
      }),
    );
    previousOrders = ordersWithLines.filter(Boolean);
  } catch (err) {
    console.warn('[QSO] Could not load previous orders:', err.message);
  }

  return { products, customers, previousOrders, customerPriceLists };
}

// -- Hook ---------------------------------------------------------------------

export function useQuickSalesData(apiBaseUrl) {
  const { token } = useAuth();
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [previousOrders, setPreviousOrders] = useState([]);
  const [customerPriceLists, setCustomerPriceLists] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const soBase = apiBaseUrl ? `${apiBaseUrl}/sales-order` : null;

  useEffect(() => {
    let cancelled = false;

    if (!token || !soBase) {
      setError('No API connection — authentication required');
      setLoading(false);
      return;
    }

    const headers = buildAuthHeaders(token);
    loadFromAPI(soBase, headers)
      .then(result => {
        if (cancelled) return;
        setProducts(result.products);
        setCustomers(result.customers);
        setPreviousOrders(result.previousOrders);
        setCustomerPriceLists(result.customerPriceLists || {});
        setError(null);
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        setError(`Failed to load sales data: ${err.message}`);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [token, soBase]);

  // Derived: product categories
  const categories = useMemo(
    () => [...new Set(products.map(p => p.category))],
    [products],
  );

  // Derived: top sellers per customer (computed from order history)
  const topSellers = useMemo(() => {
    const freq = {};
    for (const order of previousOrders) {
      if (!order.customerId) continue;
      if (!freq[order.customerId]) freq[order.customerId] = {};
      for (const line of order.lines) {
        if (line.productId) {
          freq[order.customerId][line.productId] =
            (freq[order.customerId][line.productId] || 0) + line.qty;
        }
      }
    }
    const result = {};
    for (const [custId, prods] of Object.entries(freq)) {
      result[custId] = Object.entries(prods)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id]) => id);
    }
    return result;
  }, [previousOrders]);

  return { products, customers, categories, topSellers, previousOrders, customerPriceLists, loading, error };
}

// Static config — not mock data
export const PAYMENT_METHODS = [
  { id: 'cash', labelKey: 'qsoCash', icon: 'Banknote' },
  { id: 'card', labelKey: 'qsoCard', icon: 'CreditCard' },
  { id: 'transfer', labelKey: 'qsoTransfer', icon: 'ArrowRightLeft' },
];
