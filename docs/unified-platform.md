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
`mister-bean-quotes` project. The new platform does not connect to either
project at runtime.

An administrator can open **Leads → Import**, paste the JSON exports, review
the record counts, and import them into `misterbean-platform`. Import is
additive and uses stable prefixed IDs (`lead-*` and `quote-*`), so it can be
repeated safely without deleting current records.

Before a production migration:

- Export both legacy databases and keep the files as a rollback backup.
- Publish the updated Firestore rules from this pull request.
- Import leads first and quotes second.
- Compare record counts and sample at least five records from every major
  status.
- Keep the old applications read-only until the business owner signs off.

## Deployment boundary

This work is intentionally delivered in a separate pull request. Merging the
pull request and publishing Firestore rules are separate, explicit production
actions.
