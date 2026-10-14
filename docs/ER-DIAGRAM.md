# Relational model (ER diagram)

```mermaid
erDiagram
 USERS ||--o{ CUSTOMERS : creates
 USERS ||--o{ ENQUIRIES : creates
 CUSTOMERS ||--o{ ENQUIRIES : submits
 ENQUIRIES ||--|{ ENQUIRY_ITEMS : contains
 PRODUCTS ||--o{ ENQUIRY_ITEMS : requested
 ENQUIRIES ||--o{ QUOTATIONS : priced_as
 CUSTOMERS ||--o{ QUOTATIONS : receives
 QUOTATIONS ||--|{ QUOTATION_ITEMS : contains
 PRODUCTS ||--o{ QUOTATION_ITEMS : quoted
 QUOTATIONS ||--o| SALES_ORDERS : converts_to
 CUSTOMERS ||--o{ SALES_ORDERS : places
 SALES_ORDERS ||--|{ SALES_ORDER_ITEMS : contains
 PRODUCTS ||--o{ SALES_ORDER_ITEMS : ordered
 PRODUCTS ||--|| INVENTORY : stock_record
 SALES_ORDERS ||--o| DISPATCHES : fulfilled_by
 DISPATCHES ||--|{ DISPATCH_ITEMS : contains
 PRODUCTS ||--o{ DISPATCH_ITEMS : dispatched
```

Key integrity controls:
- Unique product code, enquiry number, quotation number, order number and dispatch number.
- `sales_orders.quotation_id UNIQUE` means one quotation can create at most one order.
- Inventory checks ensure physical and reserved quantities are non-negative and reserved does not exceed physical.
- Item quantities must be positive; discounts and GST percentages are constrained to 0–100.
- Stock changes and workflow status changes occur in transactions.
