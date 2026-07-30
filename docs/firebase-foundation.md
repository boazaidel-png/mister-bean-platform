# Firebase foundation

The platform is prepared for a dedicated Firebase project. Until its public
configuration is supplied, the current public preview continues to use local
browser storage.

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

The next implementation step is to create the project, copy its web
configuration into the deployment environment, deploy the rules, and replace
the browser repository with an asynchronous Firestore repository.
