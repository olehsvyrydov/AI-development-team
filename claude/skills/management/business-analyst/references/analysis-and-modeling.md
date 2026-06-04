# BA — Data Analysis & Process Modeling (BPMN)

## Data Analysis & Visualization

### Statistical Methods for BA

| Method | When to Use | Example |
|--------|-------------|---------|
| **Descriptive stats** | Summarize data | Average order value, median response time |
| **Correlation** | Find relationships | Price vs. conversion rate |
| **Regression** | Predict outcomes | Revenue forecast based on marketing spend |
| **Cohort analysis** | Track groups over time | Retention by signup month |
| **Segmentation** | Group similar items | Customer segments by behavior |
| **A/B test analysis** | Compare variants | Landing page conversion |

### Key Formulas

```
Conversion Rate = (Conversions / Total Visitors) × 100

Churn Rate = (Customers Lost / Starting Customers) × 100

Customer Lifetime Value (CLV) = Average Revenue per Customer × Customer Lifespan

Customer Acquisition Cost (CAC) = Total Marketing Spend / New Customers Acquired

LTV:CAC Ratio = CLV / CAC  (Target: > 3:1)

Net Promoter Score (NPS) = % Promoters - % Detractors
```

### Data Visualization Selection

| Data Type | Best Chart | Avoid |
|-----------|------------|-------|
| **Comparison** | Bar chart, grouped bar | Pie chart for > 5 items |
| **Trend over time** | Line chart | 3D charts |
| **Part-to-whole** | Pie (< 5 items), stacked bar | Too many segments |
| **Distribution** | Histogram, box plot | Bar chart |
| **Relationship** | Scatter plot | Line chart |
| **Composition** | Stacked area, treemap | Too many categories |

### Dashboard Design Principles

```mermaid
flowchart TB
    subgraph "Executive Dashboard"
        A[1-3 Key Metrics]
        B[Trend Lines]
        C[Status Indicators]
    end

    subgraph "Operational Dashboard"
        D[5-10 Metrics]
        E[Filters]
        F[Drill-down]
    end

    subgraph "Analytical Dashboard"
        G[Multiple Views]
        H[Custom Date Ranges]
        I[Export Options]
    end
```

**Dashboard Best Practices:**
- One page, one purpose
- Most important metric in top-left
- Use consistent color coding (green = good, red = bad)
- Show trends, not just current values
- Include comparison (vs. target, vs. last period)

---

## Business Process Modeling (BPMN 2.0)

### BPMN Core Elements

| Element | Symbol | Purpose |
|---------|--------|---------|
| **Start Event** | Circle | Process begins |
| **End Event** | Bold circle | Process ends |
| **Task** | Rounded rectangle | Work to be done |
| **Gateway (XOR)** | Diamond | Exclusive decision |
| **Gateway (AND)** | Diamond + | Parallel split/join |
| **Pool** | Container | Organization/participant |
| **Lane** | Horizontal division | Role within pool |
| **Sequence Flow** | Arrow | Order of activities |
| **Message Flow** | Dashed arrow | Communication between pools |

### Process Diagram with Mermaid

```mermaid
flowchart LR
    subgraph Customer
        A((Start)) --> B[Submit Order]
        B --> C{Payment Valid?}
        C -->|No| D[Update Payment]
        D --> C
        C -->|Yes| E[Receive Confirmation]
    end

    subgraph "Order Service"
        F[Validate Order] --> G[Process Payment]
        G --> H{Payment Success?}
        H -->|Yes| I[Create Order]
        H -->|No| J[Notify Customer]
        I --> K[Send Confirmation]
        K --> L((End))
        J --> L
    end

    B -.-> F
    K -.-> E
    J -.-> D
```

### Swimlane Diagram

```mermaid
flowchart TB
    subgraph Customer["Customer"]
        A[Request Quote] --> B[Review Quote]
        B --> C{Accept?}
        C -->|Yes| D[Sign Contract]
        C -->|No| E[Negotiate]
    end

    subgraph Sales["Sales Team"]
        F[Prepare Quote] --> G[Send Quote]
        H[Revise Quote]
        I[Process Contract]
    end

    subgraph Finance["Finance"]
        J[Credit Check] --> K{Approved?}
        K -->|Yes| L[Approve Quote]
        K -->|No| M[Reject]
    end

    A --> F
    F --> J
    L --> G
    G --> B
    E --> H
    H --> G
    D --> I
```

### As-Is / To-Be Analysis

| Aspect | As-Is (Current) | To-Be (Future) | Gap |
|--------|-----------------|----------------|-----|
| **Process time** | 5 days | 1 day | -4 days |
| **Manual steps** | 12 | 3 | -9 steps |
| **Error rate** | 15% | 2% | -13% |
| **Cost per transaction** | $50 | $10 | -$40 |
| **Customer satisfaction** | 65% | 90% | +25% |

### Value Stream Mapping

```mermaid
flowchart LR
    subgraph "Value Stream: Order to Delivery"
        A[Order Received<br/>LT: 0<br/>PT: 5 min] --> B[Inventory Check<br/>LT: 2h<br/>PT: 10 min]
        B --> C[Pick & Pack<br/>LT: 4h<br/>PT: 30 min]
        C --> D[Ship<br/>LT: 24h<br/>PT: 15 min]
        D --> E[Deliver<br/>LT: 48h<br/>PT: 10 min]
    end

    F[Total Lead Time: 78 hours]
    G[Total Process Time: 70 minutes]
    H[Value-Add Ratio: 1.5%]
```

**Key Metrics:**
- **Lead Time (LT)**: Total time from start to end
- **Process Time (PT)**: Actual work time (value-add)
- **Value-Add Ratio**: PT / LT × 100 (target: > 25%)

---

