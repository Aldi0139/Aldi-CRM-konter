# Security Specification: Aldi Service Phone Firestore Storage

## 1. Data Invariants
- Each document must belong to a known collection (`services`, `products`, `sales`, `returns`, `restocks`, `expenses`, `ppob_audits`, `shifts`, `staff`, `settings`, `test`).
- Document IDs must conform to `^[a-zA-Z0-9_\-]+$` and be under 128 characters.
- String fields must be length-constrained (max size limit) to prevent Denial-of-Wallet attacks.
- Operational records (sales, services, shifts, expenses, restocks, ppob audits) must maintain data integrity and not allow field injection of ghost properties.
- Only authorized users (authenticated store users or admin `aldiservice001@gmail.com`) can mutate data.

## 2. Dirty Dozen Malicious Payloads
1. **Unbounded ID Injection**: Attempt to create document with 2KB string ID -> Rejected by `isValidId`.
2. **Ghost Field Mutation**: Creating product with unauthorized ghost field `isAdmin: true` -> Rejected by `hasOnly` keys constraint.
3. **Price Overflow/Type Poisoning**: Sending `sellingPrice: "one million"` or negative cost -> Rejected by schema validation helper.
4. **Status Spoofing**: Setting status to unknown string `HACKED` on service order -> Rejected by status enum check.
5. **PII Blanket Extraction**: Unauthenticated request attempting to dump all staff passwords -> Denied by `isSignedIn()`.
6. **Negative Cash Theft**: Sending negative expense amount to artificially inflate drawer cash -> Rejected by `amount >= 0` check.
7. **Cross-Shift Tampering**: Changing `shiftId` of completed sales transaction -> Rejected by immutable field rule.
8. **Impersonated Deletion**: Non-owner staff deleting closed shift logs -> Denied by role/admin rule.
9. **Corrupted Stock Count**: Setting `stock: -99999` -> Rejected by non-negative constraint.
10. **Null Payload Flooding**: Sending empty document with zero required fields -> Rejected by `hasAll` required keys.
11. **Malicious Script in Notes**: 500KB text payload in `technicalNotes` -> Rejected by length limit.
12. **Unauthenticated Batch Wipe**: Unauthenticated client calling delete on all collections -> Denied by default-deny catchall.

## 3. Test Runner Specification
Tests verify that all unauthorized, unauthenticated, or malformed writes return `PERMISSION_DENIED`.
