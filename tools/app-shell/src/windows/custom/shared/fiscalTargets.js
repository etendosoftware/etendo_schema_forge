export function getInvoiceFiscalTargets(specName, profile) {
  const isSales = specName === 'sales-invoice';
  const isPurchase = specName === 'purchase-invoice';

  if (profile === 'sii' || profile === 'sii-navarra') {
    return { showSii: isSales || isPurchase, showTbai: false, showVerifactu: false };
  }

  if (profile === 'tbai') {
    return { showSii: false, showTbai: isSales || isPurchase, showVerifactu: false };
  }

  if (profile === 'sii+tbai') {
    return {
      showSii: isSales || isPurchase,
      showTbai: isSales,
      showVerifactu: false,
    };
  }

  if (profile === 'verifactu') {
    return { showSii: false, showTbai: false, showVerifactu: isSales || isPurchase };
  }

  return { showSii: false, showTbai: false, showVerifactu: false };
}
