# AssetFlow — Application Flow

End-to-end process flows and state machines underlying the UI. These are the flows to actually demo.

## 1. Master Setup → First Asset (bootstrap flow)

```mermaid
flowchart LR
    A[Admin logs in with seeded account] --> B[Create Departments]
    B --> C[Create Asset Categories]
    C --> D[Promote Employees to Dept Head / Asset Manager]
    D --> E[Asset Manager registers first Asset]
    E --> F[Asset enters system: status = Available]
```

## 2. Allocation Conflict Flow (core demo scenario)

```mermaid
sequenceDiagram
    participant Raj as Employee (Raj)
    participant API as API
    participant DB as MongoDB

    Note over API,DB: Laptop AF-0114 already Allocated to Priya
    Raj->>API: POST /assets/AF-0114/allocate
    API->>DB: findOneAndUpdate(status:'Available' guard)
    DB-->>API: matchedCount = 0 (asset is Allocated)
    API-->>Raj: 409 ASSET_ALREADY_ALLOCATED + currentHolder=Priya
    Raj->>API: POST /transfer-requests {asset, requestedTo: Raj}
    API->>DB: create TransferRequest(status: Requested)
    DB-->>API: ok
    API-->>Raj: 201 Created
    Note over API: Notification sent to Asset Manager / Dept Head
```

**Transfer approval → re-allocation:**
```mermaid
flowchart LR
    A[TransferRequest: Requested] -->|Asset Manager / Dept Head approves| B[TransferRequest: Approved]
    B --> C[Old Allocation.status = TransferredOut]
    C --> D[New Allocation created, status = Active]
    D --> E[Asset stays status = Allocated, currentAllocation updated]
    E --> F[TransferRequest: Completed]
```

## 3. Return Flow

```mermaid
flowchart LR
    A[Holder or Asset Manager: Mark Returned] --> B[Capture condition check-in notes]
    B --> C[Allocation.status = Returned, actualReturnDate = now]
    C --> D[Asset.status = Available, currentAllocation = null]
    D --> E[Notification: none required, Activity Log entry written]
```

## 4. Booking Overlap Flow (core demo scenario)

```mermaid
sequenceDiagram
    participant U as User
    participant API as API
    participant DB as MongoDB

    Note over DB: Room B2 booked 09:00-10:00
    U->>API: POST /bookings {resource: B2, start: 09:30, end: 10:30}
    API->>DB: findOne overlap query (start<10:30 AND end>09:30)
    DB-->>API: conflict found (09:00-10:00 booking)
    API-->>U: 409 BOOKING_OVERLAP + conflicting booking detail
    U->>API: POST /bookings {resource: B2, start: 10:00, end: 11:00}
    API->>DB: findOne overlap query (start<11:00 AND end>10:00)
    DB-->>API: no match (back-to-back is fine)
    API->>DB: insert Booking(status: Upcoming)
    API-->>U: 201 Created
    Note over API: Notification: BookingConfirmed; reminder scheduled
```

## 5. Maintenance Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Pending: Employee raises request
    Pending --> Approved: Asset Manager approves\n(Asset.status -> Under Maintenance)
    Pending --> Rejected: Asset Manager rejects
    Approved --> TechnicianAssigned: Asset Manager assigns technician
    TechnicianAssigned --> InProgress: Technician starts work
    InProgress --> Resolved: Work completed\n(Asset.status -> previous / Available)
    Rejected --> [*]
    Resolved --> [*]
```

## 6. Audit Cycle Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Planned: Admin/Asset Manager creates cycle + assigns auditors
    Planned --> Active: Cycle date range starts / auditor begins marking
    Active --> Active: Auditor marks each asset Verified/Missing/Damaged
    Active --> Closed: Close Audit Cycle
    Closed --> [*]: Missing -> Asset.status=Lost\nDamaged -> Asset.status=Under Maintenance
```

## 7. Overdue Detection (background flow)

```mermaid
flowchart LR
    A[node-cron job, every 15 min] --> B{Allocation.status=Active AND expectedReturnDate < now?}
    B -->|yes| C[Allocation.isOverdue = true]
    C --> D[Notification: OverdueReturn to holder + Asset Manager]
    A --> E{Booking.status=Upcoming AND start <= now?}
    E -->|yes| F[Booking.status = Ongoing]
    F --> G{Booking.end <= now?}
    G -->|yes| H[Booking.status = Completed]
```

## 8. Role Journey Summaries

- **Employee:** Signup → Dashboard (own view) → browse Asset Directory → book a resource or raise a maintenance request → see own notifications/overdue flags.
- **Department Head:** everything Employee does + Dashboard scoped to department → approve allocation/transfer requests originating in department → book resources on behalf of department.
- **Asset Manager:** register assets → allocate/transfer → approve maintenance → manage audits → resolve discrepancies → org-wide reports.
- **Admin:** Organization Setup (departments, categories, role promotion) → org-wide dashboard/reports → oversight of all activity logs.

## 9. Cross-Cutting: Notification Fan-Out

Every state-changing action in §2–7 writes both (a) one or more `Notification` documents to the relevant user(s), and (b) exactly one `ActivityLog` entry recording actor/action/entity/timestamp — this is what powers the Dashboard activity feed and the Activity Logs screen without any special-cased queries.
