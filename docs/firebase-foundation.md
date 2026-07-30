# Firebase foundation

The platform is connected to the dedicated `misterbean-platform` Firebase
project. Firebase Authentication identifies the user, the `users/{uid}` profile
determines authorization, and Cloud Firestore is the source of truth for
service data.

## Shared identity

Every business record uses a single `accountId`. This is the permanent bridge
between leads, quotes, customers, machines, contracts, orders and service
tickets.

## Firestore shape

- `users/{uid}` — role and allowed `accountIds`
- `accounts/{accountId}` — canonical customer profile
- `accounts/{accountId}/contacts/{contactId}`
- `accounts/{accountId}/sites/{siteId}`
- `accounts/{accountId}/machines/{machineId}`
- `accounts/{accountId}/tickets/{ticketId}`
- `accounts/{accountId}/orders/{orderId}`
- `accounts/{accountId}/tasks/{taskId}`
- `accounts/{accountId}/contracts/{contractId}`
- `accounts/{accountId}/activity/{eventId}`

Legacy lead and quote identifiers are stored on the account so existing systems
can be migrated gradually without breaking their current workflows.

## Required Firebase services

- Authentication
- Cloud Firestore
- Storage
- App Check

Google and email/password sign-in are enabled. New accounts are created in a
pending state with no customer access. Administrators approve the account,
assign its role and attach one or more `accountIds` from the in-product access
management screen.

The bootstrap administrator is restricted to `boazaidel@gmail.com`. This
account may create its initial admin profile; all other first-time users receive
a pending customer profile.
