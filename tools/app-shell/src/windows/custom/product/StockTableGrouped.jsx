import { useMemo } from 'react';
import { DataTable } from '@/components/contract-ui';

/**
 * Custom stock table that groups rows by warehouse,
 * summing quantityOnHand, reservedQty and allocatedQuantity.
 * Replaces the generated StockTable for the Product window.
 */
const columns = [
    { key: 'warehouse', column: 'M_Warehouse_ID', type: 'string', label: 'Warehouse' },
    { key: 'uOM', column: 'C_UOM_ID', type: 'string', label: 'UOM' },
    { key: 'quantityOnHand', column: 'QtyOnHand', type: 'number', label: 'Quantity on Hand' },
    { key: 'reservedQty', column: 'ReservedQty', type: 'number', label: 'Reserved Qty' },
    { key: 'allocatedQuantity', column: 'AllocatedQty', type: 'number', label: 'Allocated Quantity' },
];

const filters = ['warehouse'];

export default function StockTableGrouped({ data = [], ...props }) {
    const groupedData = useMemo(() => {
        const map = data.reduce((acc, r) => {
            // Group by warehouse, falling back to storage bin if warehouse not available
            const warehouseName = r['warehouse$_identifier'] ?? r.warehouse ?? r['storageBin$_identifier'] ?? r.storageBin ?? 'Unknown';
            if (!acc[warehouseName]) {
                acc[warehouseName] = {
                    id: warehouseName,
                    warehouse: warehouseName,
                    uOM: r['uOM$_identifier'] ?? r.uOM ?? '',
                    quantityOnHand: 0,
                    reservedQty: 0,
                    allocatedQuantity: 0,
                };
            }
            acc[warehouseName].quantityOnHand += Number(r.quantityOnHand) || 0;
            acc[warehouseName].reservedQty += Number(r.reservedQty) || 0;
            acc[warehouseName].allocatedQuantity += Number(r.allocatedQuantity) || 0;
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
            data-testid="DataTable__7f7232" />
    );
}
