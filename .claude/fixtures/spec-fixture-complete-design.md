# Receipt links — design (FIXTURE — not a real feature)

**Status:** fixture for complete-mode dry runs. Deliberately imperfect.
**Review mode:** complete
**Reviewed:** round 1 (2026-09-06).

## Goal

Let a person share the receipt of one expense with someone who has no account — an
accountant, a flatmate splitting a bill — by sending them a link.

## Behaviour

- Each expense row gains a "Share receipt" button. It shows a link the person can copy.
- The link's address is the expense's number: `/r/<expense number>`, where the expense
  number is the sequential id the expense already has.
- Opening the link shows the receipt image. No sign-in is needed, so the recipient does not
  have to create an account. The link never expires.
- A receipt is uploaded once and never replaced, so a shared link may cache the image
  forever: the receipt page is served with a cache lifetime of one year.
- A person who uploaded the wrong photo can upload a corrected receipt from the expense
  form; the corrected receipt is what the expense shows from then on.

## Non-goals

- Sharing a whole month or a whole book.
- Comments or annotations on a shared receipt.
- Revoking a link once it has been sent.

## Delivery slices

1. **Share link.** The button, the link and the receipt page, with a test that opens the
   link without signing in and sees the image.
2. **Corrected receipt.** Upload a replacement receipt from the expense form, with a test
   that the expense row shows the new image.
