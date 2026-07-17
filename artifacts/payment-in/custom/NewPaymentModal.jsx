import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateField } from '@/components/ui/date-field';
import { useUI } from '@/i18n';
import { trackDocumentCreated } from '@/lib/observability/health-events.js';

function fmtDate(raw) {
  if (!raw) return '-';
  const str = String(raw);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str);
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(raw);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmt(val, curr) {
  const n = typeof val === 'string' ? Number.parseFloat(val) : (val ?? 0);
  if (curr) {
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: curr }).format(n); } catch { /* */ }
  }
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function NewPaymentModal({ token, apiBaseUrl, windowName, onClose }) {
  const navigate = useNavigate();
  const ui = useUI();
  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);

  const [mode, setMode] = useState('credit'); // 'credit' | 'invoice'
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Shared fields
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [loadingPaymentMethods, setLoadingPaymentMethods] = useState(true);
  const [accountId, setAccountId] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  // Invoice mode
  const [customers, setCustomers] = useState([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [customerId, setCustomerId] = useState('');
  const [invoices, setInvoices] = useState([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [invoiceId, setInvoiceId] = useState('');
  // Credit mode
  const [description, setDescription] = useState('');

  // Fetch payment methods
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${base}/payment-in/finPayment/selectors/paymentMethod?_startRow=0&_endRow=100`, { headers });
        if (res.ok) {
          const json = await res.json();
          const items = json.items || json?.response?.data || [];
          setPaymentMethods(items.map(m => ({ id: m.id, name: m.label || m._identifier || m.name })));
        }
      } catch { /* silent */ }
      finally { setLoadingPaymentMethods(false); }
    })();
  }, [base, headers]);

  // Fetch accounts, filtered by payment method when one is selected
  useEffect(() => {
    setLoadingAccounts(true);
    setAccountId('');
    (async () => {
      try {
        const methodParam = paymentMethodId ? `&Fin_Paymentmethod_ID=${encodeURIComponent(paymentMethodId)}` : '';
        const res = await fetch(`${base}/payment-in/finPayment/selectors/account?_startRow=0&_endRow=50${methodParam}`, { headers });
        if (res.ok) {
          const json = await res.json();
          const items = json.items || json?.response?.data || [];
          const mapped = items.map(a => ({ id: a.id, name: a.label || a._identifier || a.name }));
          setAccounts(mapped);
          if (mapped.length > 0) setAccountId(mapped[0].id);
        }
      } catch { /* silent */ }
      finally { setLoadingAccounts(false); }
    })();
  }, [base, headers, paymentMethodId]);

  // Fetch customers (BPs)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${base}/payment-in/finPayment/selectors/C_Bpartner_ID?_startRow=0&_endRow=100`, { headers });
        if (res.ok) {
          const json = await res.json();
          const items = json.items || json?.response?.data || [];
          setCustomers(items.map(c => ({ id: c.id, name: c.label || c._identifier || c.name })));
        }
      } catch { /* silent */ }
      finally { setLoadingCustomers(false); }
    })();
  }, [base, headers]);

  // Fetch pending invoices when customer changes
  useEffect(() => {
    if (!customerId) { setInvoices([]); return; }
    let cancelled = false;
    setLoadingInvoices(true);
    (async () => {
      try {
        const res = await fetch(`${base}/sales-invoice/header?businessPartner=${customerId}&_startRow=0&_endRow=100`, { headers });
        if (res.ok && !cancelled) {
          const all = (await res.json())?.response?.data || [];
          const pending = all.filter(inv => inv.documentStatus === 'CO' && Number.parseFloat(inv.outstandingAmount) > 0);
          setInvoices(pending);
        }
      } catch { /* silent */ }
      finally { if (!cancelled) setLoadingInvoices(false); }
    })();
    return () => { cancelled = true; };
  }, [customerId, base, headers]);

  // When invoice is selected, set amount to outstanding
  useEffect(() => {
    if (!invoiceId) return;
    const inv = invoices.find(i => i.id === invoiceId);
    if (inv) setAmount(String(Number.parseFloat(inv.outstandingAmount) || 0));
  }, [invoiceId, invoices]);

  const handleClose = () => {
    if (onClose) onClose();
    else navigate(`/${windowName}`);
  };

  const handleCreateLinked = async () => {
    if (!customerId || !invoiceId || !amount || !accountId) { setError(ui('fillAllRequiredFields')); return; }
    setError(null);
    setSaving(true);
    try {
      // Find the first pending schedule for this invoice
      const schedRes = await fetch(`${base}/sales-invoice/paymentPlan?parentId=${invoiceId}&_startRow=0&_endRow=10`, { headers });
      let scheduleId = '';
      if (schedRes.ok) {
        const scheds = (await schedRes.json())?.response?.data || [];
        const pending = scheds.find(s => Number.parseFloat(s.outstandingAmount) > 0);
        scheduleId = pending?.finPaymentScheduleID || pending?.id || '';
      }

      const res = await fetch(`${base}/sales-invoice/header/${invoiceId}/action/registerPayment`, {
        method: 'POST', headers,
        body: JSON.stringify({
          scheduleId,
          actual_payment: String(amount),
          payment_date: date,
          fin_financial_account_id: accountId,
          ...(paymentMethodId && { fin_paymentmethod_id: paymentMethodId }),
        }),
      });
      const resJson = await res.json().catch(() => null);
      if (!res.ok) throw new Error(resJson?.response?.message || resJson?.message || `Failed (${res.status})`);
      const paymentId = resJson?.response?.data?.id;
      if (paymentId) {
        trackDocumentCreated('payment-in');
        navigate(`/${windowName}/${paymentId}`);
      } else {
        handleClose();
      }
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const handleCreateCredit = async () => {
    if (!customerId || !amount || !accountId) { setError(ui('fillAllRequiredFields')); return; }
    setError(null);
    setSaving(true);
    try {
      // Create a payment directly via the payment-in entity
      const body = {
        businessPartner: customerId,
        amount: Number.parseFloat(amount),
        paymentDate: date,
        account: accountId,
        ...(paymentMethodId && { paymentMethod: paymentMethodId }),
        receipt: true,
        documentStatus: 'DR',
      };
      if (description.trim()) body.description = description.trim();

      const res = await fetch(`${base}/payment-in/finPayment`, {
        method: 'POST', headers, body: JSON.stringify(body),
      });
      const resJson = await res.json().catch(() => null);
      if (!res.ok) throw new Error(resJson?.response?.message || resJson?.message || `Failed (${res.status})`);
      const paymentId = resJson?.response?.data?.id || resJson?.id;
      if (paymentId) {
        navigate(`/${windowName}/${paymentId}`);
      } else {
        handleClose();
      }
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const isInvoiceMode = mode === 'invoice';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={handleClose}>
      <div className="bg-white rounded-xl shadow-lg flex flex-col overflow-hidden"
        style={{ width: 480, maxHeight: '85vh', border: '0.5px solid #E5E7EB' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2 }}>{ui('financeCollections')}</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#111827' }}>{ui('newPayment')}</div>
            </div>
            <button type="button" onClick={handleClose} style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, border: '0.5px solid #E5E7EB', background: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 14, lineHeight: 1 }}>&times;</button>
          </div>
        </div>

        {/* Mode selector */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '12px 14px', borderBottom: '1px solid #E5E7EB' }}>
          <button type="button" onClick={() => setMode('credit')}
            style={{
              padding: '12px 14px', borderRadius: 8, textAlign: 'left', cursor: 'pointer',
              border: !isInvoiceMode ? '2px solid #3b82f6' : '0.5px solid #d1d5db',
              background: !isInvoiceMode ? '#eff6ff' : '#fff',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={!isInvoiceMode ? '#2563eb' : '#6B7280'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
              <span style={{ fontSize: 12, fontWeight: 500, color: !isInvoiceMode ? '#2563eb' : '#374151' }}>{ui('creditAdvance')}</span>
            </div>
            <div style={{ fontSize: 10, color: '#9ca3af' }}>{ui('creditAdvanceDescription')}</div>
          </button>
          <button type="button" onClick={() => setMode('invoice')}
            style={{
              padding: '12px 14px', borderRadius: 8, textAlign: 'left', cursor: 'pointer',
              border: isInvoiceMode ? '2px solid #3b82f6' : '0.5px solid #d1d5db',
              background: isInvoiceMode ? '#eff6ff' : '#fff',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isInvoiceMode ? '#2563eb' : '#6B7280'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              <span style={{ fontSize: 12, fontWeight: 500, color: isInvoiceMode ? '#2563eb' : '#374151' }}>{ui('linkedToInvoiceMode')}</span>
            </div>
            <div style={{ fontSize: 10, color: '#9ca3af' }}>{ui('linkedToInvoiceModeDescription')}</div>
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto" style={{ padding: '14px 16px' }}>
          {/* Credit mode banner */}
          {!isInvoiceMode && (
            <div style={{ display: 'flex', gap: 8, padding: '10px 12px', background: '#eff6ff', borderRadius: 8, marginBottom: 12, border: '0.5px solid #bfdbfe' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
              <span style={{ fontSize: 11, color: '#1e40af', lineHeight: 1.4 }}>
                {ui('creditAdvanceDescription')}
              </span>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Customer */}
            <div>
              <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 3 }}>{ui('customer')}</label>
              {loadingCustomers ? (
                <div style={{ fontSize: 12, color: '#9ca3af', padding: '6px 10px' }}>{ui('loading')}</div>
              ) : (
                <Select value={customerId} onValueChange={v => { setCustomerId(v); setInvoiceId(''); }} required>
                  <SelectTrigger style={{ height: 34, fontSize: 13 }}><SelectValue placeholder={ui('selectCustomer')} /></SelectTrigger>
                  <SelectContent style={{ zIndex: 60 }}>
                    {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Invoice (only in invoice mode) */}
            {isInvoiceMode && (
              <div>
                <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 3 }}>{ui('invoice')}</label>
                {!customerId ? (
                  <div style={{ fontSize: 12, color: '#9ca3af', padding: '6px 10px', border: '0.5px solid #E5E7EB', borderRadius: 6 }}>{ui('selectCustomerFirst')}</div>
                ) : loadingInvoices ? (
                  <div style={{ fontSize: 12, color: '#9ca3af', padding: '6px 10px' }}>{ui('loadingInvoices')}</div>
                ) : invoices.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#9ca3af', padding: '6px 10px', border: '0.5px solid #E5E7EB', borderRadius: 6 }}>{ui('noPendingInvoices')}</div>
                ) : (
                  <Select value={invoiceId} onValueChange={setInvoiceId} required>
                    <SelectTrigger style={{ height: 34, fontSize: 13 }}><SelectValue placeholder={ui('selectInvoice')} /></SelectTrigger>
                    <SelectContent style={{ zIndex: 60 }}>
                      {invoices.map(inv => (
                        <SelectItem key={inv.id} value={inv.id}>
                          #{inv.documentNo} &middot; {fmt(inv.grandTotalAmount, inv['currency$_identifier'])} &middot; {ui('pending')} {fmt(inv.outstandingAmount, inv['currency$_identifier'])}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {/* Date + Amount */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 3 }}>{ui('date')}</label>
                <DateField value={date} onChange={setDate} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 3 }}>{ui('amount')}</label>
                <input type="number" min={0} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className="text-sm tabular-nums"
                  style={{ width: '100%', border: '0.5px solid #E5E7EB', borderRadius: 6, padding: '7px 10px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>

            {/* Payment Method */}
            <div>
              <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 3 }}>{ui('method')}</label>
              {loadingPaymentMethods ? (
                <div style={{ fontSize: 12, color: '#9ca3af', padding: '6px 10px' }}>{ui('loading')}</div>
              ) : (
                <Select value={paymentMethodId} onValueChange={v => { setPaymentMethodId(v); }}>
                  <SelectTrigger style={{ height: 34, fontSize: 13 }}><SelectValue placeholder={ui('selectPaymentMethod')} /></SelectTrigger>
                  <SelectContent style={{ zIndex: 60 }}>
                    {paymentMethods.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Account */}
            <div>
              <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 3 }}>{ui('account')}</label>
              {loadingAccounts ? (
                <div style={{ fontSize: 12, color: '#9ca3af', padding: '6px 10px' }}>{ui('loading')}</div>
              ) : (
                <Select value={accountId} onValueChange={setAccountId} required>
                  <SelectTrigger style={{ height: 34, fontSize: 13 }}><SelectValue placeholder={ui('selectAccount')} /></SelectTrigger>
                  <SelectContent style={{ zIndex: 60 }}>
                    {accounts.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Description (credit mode only) */}
            {!isInvoiceMode && (
              <div>
                <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 3 }}>{ui('description')}</label>
                <input type="text" value={description} onChange={e => setDescription(e.target.value)}
                  placeholder={ui('creditDescriptionPlaceholder')}
                  style={{ width: '100%', fontSize: 13, border: '0.5px solid #E5E7EB', borderRadius: 6, padding: '7px 10px', outline: 'none', color: '#374151', boxSizing: 'border-box' }} />
              </div>
            )}
          </div>

          {error && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 8 }}>{error}</div>}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', borderTop: '0.5px solid #d1d5db', padding: '10px 16px' }}>
          <button type="button" onClick={handleClose}
            style={{ fontSize: 13, padding: '6px 14px', borderRadius: 6, border: '0.5px solid #E5E7EB', background: 'transparent', color: '#6B7280', cursor: 'pointer' }}>
            {ui('cancel')}
          </button>
          <button type="button" onClick={isInvoiceMode ? handleCreateLinked : handleCreateCredit} disabled={saving}
            style={{ fontSize: 13, fontWeight: 500, padding: '6px 16px', borderRadius: 6, border: 'none', background: '#18181b', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.5 : 1 }}>
            {saving ? ui('creating') : (isInvoiceMode ? ui('createPayment') : ui('createCredit'))}
          </button>
        </div>
      </div>
    </div>
  );
}
