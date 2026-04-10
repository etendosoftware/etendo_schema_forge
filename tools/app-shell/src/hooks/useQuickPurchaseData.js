import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/auth/AuthContext.jsx';

// -- Helpers ------------------------------------------------------------------

function guessCategory(name) {
  const n = (name || '').toLowerCase();
  if (/laptop|monitor|tablet|graphics|cpu|ram|ssd|power supply/i.test(n)) return 'Computing';
  if (/mouse|keyboard|headset|webcam|docking/i.test(n)) return 'Peripherals';
  if (/cable|router|switch|network|ups/i.test(n)) return 'Networking';
  if (/printer|scanner|hdd|external/i.test(n)) return 'Storage & Print';
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

async function loadFromAPI(poBase, headers) {
  // Fetch catalogs (required) and orders (best-effort) independently
  const [productsRes, suppliersRes, taxRes, uomRes] = await Promise.all([
    fetchJSON(`${poBase}/lines/selectors/M_Product_ID?limit=200`, headers),
    fetchJSON(`${poBase}/header/selectors/C_BPartner_ID?limit=200`, headers),
    fetchJSON(`${poBase}/lines/selectors/C_Tax_ID?limit=50`, headers),
    fetchJSON(`${poBase}/lines/selectors/C_UOM_ID?limit=50`, headers),
  ]);

  // Build lookup maps
  const rawTaxes = parseSelectorItems(taxRes);
  const rawUOMs = parseSelectorItems(uomRes);
  const defaultTax = rawTaxes.find(t => (t.name || t.label || '').includes('21')) || rawTaxes[0];
  const defaultTaxRate = (defaultTax?.rate || 21) / 100;
  const uomMap = Object.fromEntries(rawUOMs.map(u => [u.id, u.name || u.label || 'Unit']));

  // Map products — coerce numeric fields to avoid .toFixed() on strings
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

  // Map suppliers
  const rawSuppliers = parseSelectorItems(suppliersRes);
  const suppliers = rawSuppliers.map(bp => ({
    id: bp.id,
    name: bp.label || bp.name || bp._identifier || bp.id,
    taxId: bp.taxID || bp.taxId || '',
    email: bp.email || '',
    phone: bp.phone || '',
  }));

  // Fetch previous completed orders (best-effort — don't block products/suppliers)
  let previousOrders = [];
  let supplierPriceLists = {};
  try {
    const headersRes = await fetchJSON(
      `${poBase}/header?_sortBy=creationDate desc&_startRow=0&_endRow=19&documentStatus=CO`,
      headers,
    );
    const rawHeaders = parseEntityRows(headersRes).filter(h => h.documentStatus === 'CO');
    if (rawHeaders.length === 0) {
      console.warn('[QPO] No completed PO headers found');
    }

    // Build supplier → priceList mapping from order headers
    for (const h of rawHeaders) {
      const bpId = h.businessPartner || h.C_BPartner_ID;
      const plName = h['priceList$_identifier'] || '';
      if (bpId && plName) supplierPriceLists[bpId] = plName;
    }

    const ordersWithLines = await Promise.all(
      rawHeaders.slice(0, 10).map(async (h) => {
        // NEO uses field names (businessPartner) not column names (C_BPartner_ID)
        const bpId = h.businessPartner || h.C_BPartner_ID || null;
        const bpName = h['businessPartner$_identifier'] || '';
        try {
          const linesData = await fetchJSON(`${poBase}/lines?parentId=${h.id}`, headers);
          const rawLines = parseEntityRows(linesData);
          return {
            id: h.id,
            documentNo: h.documentNo || h.id,
            date: h.orderDate || h.creationDate || '',
            supplierId: bpId,
            supplierName: bpName,
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
    console.warn('[QPO] Could not load previous orders:', err.message);
  }

  return { products, suppliers, previousOrders, supplierPriceLists };
}

// -- Hook ---------------------------------------------------------------------

export function useQuickPurchaseData(apiBaseUrl) {
  const { token } = useAuth();
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [previousOrders, setPreviousOrders] = useState([]);
  const [supplierPriceLists, setSupplierPriceLists] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const poBase = apiBaseUrl ? `${apiBaseUrl}/purchase-order` : null;

  useEffect(() => {
    let cancelled = false;

    if (!token || !poBase) {
      setError('No API connection — authentication required');
      setLoading(false);
      return;
    }

    const headers = buildAuthHeaders(token);
    loadFromAPI(poBase, headers)
      .then(result => {
        if (cancelled) return;
        setProducts(result.products);
        setSuppliers(result.suppliers);
        setPreviousOrders(result.previousOrders);
        setSupplierPriceLists(result.supplierPriceLists || {});
        setError(null);
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        setError(`Failed to load purchase data: ${err.message}`);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [token, poBase]);

  // Derived: product categories
  const categories = useMemo(
    () => [...new Set(products.map(p => p.category))],
    [products],
  );

  // Derived: top sellers per supplier (computed from order history)
  const topSellers = useMemo(() => {
    const freq = {};
    for (const order of previousOrders) {
      if (!order.supplierId) continue;
      if (!freq[order.supplierId]) freq[order.supplierId] = {};
      for (const line of order.lines) {
        if (line.productId) {
          freq[order.supplierId][line.productId] =
            (freq[order.supplierId][line.productId] || 0) + line.qty;
        }
      }
    }
    const result = {};
    for (const [suppId, prods] of Object.entries(freq)) {
      result[suppId] = Object.entries(prods)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id]) => id);
    }
    return result;
  }, [previousOrders]);

  return { products, suppliers, categories, topSellers, previousOrders, supplierPriceLists, loading, error };
}

// Static config — not mock data
export const SEND_METHODS = [
  { id: 'email', labelKey: 'qpoEmail', icon: 'Mail' },
  { id: 'whatsapp', labelKey: 'qpoWhatsApp', icon: 'MessageCircle' },
  { id: 'pdf', labelKey: 'qpoPDF', icon: 'FileText' },
];
