# Mister Bean — unified commercial and service platform

## One customer lifecycle

The platform now uses one Firebase project and one authenticated staff identity
for the complete lifecycle:

1. A record is created in the top-level `leads` collection.
2. A quote is created from the lead and stores `leadId`.
3. Saving or sending the quote updates the lead stage and stores `quoteIds`.
4. An approved quote can be converted once into an `accounts` document.
5. The account stores `sourceLeadId` and `sourceQuoteId`.
6. Equipment from the quote is created below
   `accounts/{accountId}/machines` and immediately becomes available to the
   service workspace.

Customer users never receive access to `leads` or `quotes`. Active staff and
administrators use the same role document already used by the service system.

## Migration from the two legacy systems

The legacy leads application uses Firebase Realtime Database in the
`mister-bean` project. The legacy quote calculator uses Firestore in the
`mister-bean-quotes` project.

An administrator can open **Leads → Data transfer** and connect directly to
both legacy projects with the existing legacy email/password credentials.
Authentication happens in the browser using Firebase Auth with in-memory
persistence; passwords are never stored in the unified platform.

The transfer first shows the source counts and offers a raw JSON backup
download. Only after administrator confirmation are records written to
`misterbean-platform`. The transfer is additive and uses stable prefixed IDs
(`lead-*` and `quote-*`), so it can be repeated safely without deleting
current records. The stored destination counts are read back after the write
and shown to the administrator.

The transfer preserves, rather than flattens:

- lead workflow tabs, priority, follow-up, meetings, soft-delete state,
  status history, future follow-ups, tasks and source metadata;
- every saved quote version and its complete commercial calculation inputs;
- blends, volume discount, equipment and accessories by importer, allocation
  between free/lease/sale, financing, payment terms and cash-flow settings.

Before a production migration:

- Download the raw backup offered by the transfer flow and keep it as a
  rollback source.
- Publish the updated Firestore rules from this pull request.
- Preview source counts before writing.
- Compare the destination counts returned after the transfer and sample at
  least five records from every major status and quote version group.
- Keep the old applications read-only until the business owner signs off.

## Feature parity

The unified leads workspace retains the nine operational views from the
legacy application, quick status updates, duplicate detection, soft delete
and restore, future lead promotion, CSV/Excel-compatible export and import,
meeting links and ICS downloads.

The unified quote builder retains the five-stage commercial workflow and the
legacy calculation engine: consumption, blend pricing, volume discount,
equipment by importer, automatic accessories, machine recommendation,
free/lease/sale allocation, supplier installments, financing and interest,
payment delays, monthly cash flow, exposure, break-even, contract profit,
improvement recommendations, version copies, deletion and graphic summary.

## Deployment boundary

This work is intentionally delivered in a separate pull request. Merging the
pull request and publishing Firestore rules are separate, explicit production
actions.
