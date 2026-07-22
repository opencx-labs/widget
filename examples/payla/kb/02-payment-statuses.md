# Payment statuses explained

Every Payla payment moves through a lifecycle. The status tells you exactly where
the money is.

| Status | Meaning | Money moved? |
| --- | --- | --- |
| **Open** | Created but the customer hasn't paid yet. | No |
| **Pending** | The customer started paying; the bank is confirming. | Not yet |
| **Authorized** | Funds are reserved (cards) but not yet captured. | Reserved |
| **Paid** | The payment succeeded. | Yes |
| **Failed** | The payment was declined or errored. | No |
| **Canceled** | The customer or you canceled before completion. | No |
| **Expired** | The customer didn't pay in time and the payment lapsed. | No |
| **Refunded** | The full amount was returned to the customer. | Reversed |
| **Partially refunded** | Part of the amount was returned. | Partly reversed |
| **Charged back** | The customer disputed the payment with their bank. | At risk |

## Common questions

- **"Why is my payment still pending?"** Some methods (bank transfer, certain
  iDEAL flows) take minutes to hours to confirm. It will move to *paid* or
  *failed* on its own.
- **"A payment failed — will the customer be charged?"** No. Failed and expired
  payments never move money. Ask the customer to try again.
- **"What does charged back mean?"** The customer opened a dispute with their
  bank. See *Disputes and chargebacks*.

Only **paid** and **partially refunded** payments can be refunded.
