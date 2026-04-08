import { useMemo } from 'react';
import { DataTable } from '@/components/contract-ui';

/**
 * Custom stock table that groups rows by storage bin,
 * summing quantityOnHand, reservedQty and allocatedQuantity.
 * Replaces the generated StockTable for the Product window.
 */
const columns = [
    { key: 'storageBin', column: 'M_Locator_ID', type: 'string', label: 'Storage Bin' },
    { key: 'uOM', column: 'C_UOM_ID', type: 'string', label: 'UOM' },
    { key: 'quantityOnHand', column: 'QtyOnHand', type: 'number', label: 'Quantity on Hand' },
    { key: 'reservedQty', column: 'ReservedQty', type: 'number', label: 'Reserved Qty' },
    { key: 'allocatedQuantity', column: 'AllocatedQty', type: 'number', label: 'Allocated Quantity' },
];

const filters = ['storageBin'];

export default function StockTableGrouped({ data = [], ...props }) {
    const groupedData = useMemo(() => {
        const map = data.reduce((acc, r) => {
            // Use the human-readable identifier if available
            const binName = r['storageBin$_identifier'] ?? r.storageBin ?? 'Unknown';
            if (!acc[binName]) {
                acc[binName] = {
                    id: binName,
                    storageBin: binName,
                    uOM: r['uOM$_identifier'] ?? r.uOM ?? '',
                    quantityOnHand: 0,
                    reservedQty: 0,
                    allocatedQuantity: 0,
                };
            }
            acc[binName].quantityOnHand += Number(r.quantityOnHand) || 0;
            acc[binName].reservedQty += Number(r.reservedQty) || 0;
            acc[binName].allocatedQuantity += Number(r.allocatedQuantity) || 0;
            return acc;
        }, {});
        return Object.values(map).sort((a, b) => b.quantityOnHand - a.quantityOnHand);
    }, [data]);

    return (
        <DataTable
            columns={columns}
            filters={filters}
            data={groupedData}
            selectable={false}
            {...props}
        />
    );
}
