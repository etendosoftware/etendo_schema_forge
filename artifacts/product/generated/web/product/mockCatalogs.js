// Auto-generated mock catalogs for FK reference data - do not edit manually

const catalogs = {};

catalogs['UOM'] = [
  {
    "id": "uom-001",
    "name": "Each"
  },
  {
    "id": "uom-002",
    "name": "Box"
  },
  {
    "id": "uom-003",
    "name": "Kg"
  },
  {
    "id": "uom-004",
    "name": "Meter"
  },
  {
    "id": "uom-005",
    "name": "Liter"
  }
];

catalogs['ProductCategory'] = [
  {
    "id": "cat-001",
    "name": "Electronics"
  },
  {
    "id": "cat-002",
    "name": "Accessories"
  },
  {
    "id": "cat-003",
    "name": "Peripherals"
  },
  {
    "id": "cat-004",
    "name": "Displays"
  },
  {
    "id": "cat-005",
    "name": "Audio"
  },
  {
    "id": "cat-006",
    "name": "Storage"
  },
  {
    "id": "cat-007",
    "name": "Components"
  },
  {
    "id": "cat-008",
    "name": "Networking"
  },
  {
    "id": "cat-009",
    "name": "Power"
  }
];

catalogs['Product'] = [
  {
    "id": "prod-001",
    "name": "Laptop Pro 15",
    "price": 1299,
    "uomId": "uom-001"
  },
  {
    "id": "prod-002",
    "name": "USB-C Cable",
    "price": 15,
    "uomId": "uom-001"
  },
  {
    "id": "prod-003",
    "name": "Wireless Mouse",
    "price": 29,
    "uomId": "uom-001"
  },
  {
    "id": "prod-004",
    "name": "Mechanical Keyboard",
    "price": 89,
    "uomId": "uom-001"
  },
  {
    "id": "prod-005",
    "name": "Monitor 27\"",
    "price": 549,
    "uomId": "uom-001"
  },
  {
    "id": "prod-006",
    "name": "Webcam HD",
    "price": 79,
    "uomId": "uom-001"
  },
  {
    "id": "prod-007",
    "name": "Headset Pro",
    "price": 149,
    "uomId": "uom-001"
  },
  {
    "id": "prod-008",
    "name": "Docking Station",
    "price": 199,
    "uomId": "uom-001"
  },
  {
    "id": "prod-009",
    "name": "SSD 1TB",
    "price": 109,
    "uomId": "uom-001"
  },
  {
    "id": "prod-010",
    "name": "RAM 16GB",
    "price": 65,
    "uomId": "uom-001"
  },
  {
    "id": "prod-011",
    "name": "Power Supply 750W",
    "price": 95,
    "uomId": "uom-001"
  },
  {
    "id": "prod-012",
    "name": "Network Switch",
    "price": 45,
    "uomId": "uom-001"
  },
  {
    "id": "prod-013",
    "name": "Printer Laser",
    "price": 299,
    "uomId": "uom-001"
  },
  {
    "id": "prod-014",
    "name": "Scanner Flatbed",
    "price": 189,
    "uomId": "uom-001"
  },
  {
    "id": "prod-015",
    "name": "External HDD 2TB",
    "price": 79,
    "uomId": "uom-001"
  },
  {
    "id": "prod-016",
    "name": "Tablet 10\"",
    "price": 449,
    "uomId": "uom-001"
  },
  {
    "id": "prod-017",
    "name": "Router Pro",
    "price": 129,
    "uomId": "uom-001"
  },
  {
    "id": "prod-018",
    "name": "UPS Battery",
    "price": 159,
    "uomId": "uom-001"
  },
  {
    "id": "prod-019",
    "name": "Graphics Card",
    "price": 699,
    "uomId": "uom-001"
  },
  {
    "id": "prod-020",
    "name": "CPU Cooler",
    "price": 49,
    "uomId": "uom-001"
  }
];

catalogs['Warehouse'] = [
  {
    "id": "wh-001",
    "name": "Main Warehouse"
  },
  {
    "id": "wh-002",
    "name": "East Distribution Center"
  },
  {
    "id": "wh-003",
    "name": "West Hub"
  },
  {
    "id": "wh-004",
    "name": "North Storage"
  },
  {
    "id": "wh-005",
    "name": "South Logistics"
  }
];

catalogs['StorageBin'] = [
  {
    "id": "sb-001",
    "name": "A-01-01",
    "warehouseId": "wh-001"
  },
  {
    "id": "sb-002",
    "name": "A-01-02",
    "warehouseId": "wh-001"
  },
  {
    "id": "sb-003",
    "name": "A-02-01",
    "warehouseId": "wh-002"
  },
  {
    "id": "sb-004",
    "name": "A-02-02",
    "warehouseId": "wh-002"
  },
  {
    "id": "sb-005",
    "name": "B-01-01",
    "warehouseId": "wh-003"
  },
  {
    "id": "sb-006",
    "name": "B-01-02",
    "warehouseId": "wh-003"
  },
  {
    "id": "sb-007",
    "name": "B-02-01",
    "warehouseId": "wh-004"
  },
  {
    "id": "sb-008",
    "name": "B-02-02",
    "warehouseId": "wh-004"
  },
  {
    "id": "sb-009",
    "name": "C-01-01",
    "warehouseId": "wh-005"
  },
  {
    "id": "sb-010",
    "name": "C-01-02",
    "warehouseId": "wh-005"
  }
];

export default catalogs;
