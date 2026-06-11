# Decode-Quality Validation Test — 20 Job-Seekers

**Written:** 2026-06-11 — *before any results, on purpose.*
**Question this test answers:** Does the rejection decode land hard enough — feel
specific, tell people something non-obvious — that they'd come back to it?
**NOT testing yet:** pricing, willingness to pay, subscription intent, UI polish.
Quality first; if quality lands, pricing is the *next* test.

---

## The design problem: bias

Friends and recruited testers want to be encouraging. "Did you like it?" gets a
yes that means nothing. The entire protocol is built to **make the true answer
easier to give than the polite one**, and to **capture behavior over opinion**
wherever possible.

---

## Who (n=20)

- Currently job-hunting, with a **real rejection email they can paste.**
  Not "imagine you got rejected" — the decode is only testable on a real
  rejection the person has feelings and context about.
- **Mix of stages** if possible: some with only ATS auto-rejects, some who
  reached interviews. The decode's value may differ sharply by stage — you want
  to know where it lands and where it doesn't.

---

## The behavioral signal that beats every survey answer

**Do they paste a SECOND rejection without being asked?**

Voluntary second-paste is the realest "this was worth it" you'll get. The flow
is stateless/no-account, so this isn't tracked per-user automatically — so it
must be **built in as a moment**: after the first decode, the screen offers
*"Got another? Paste it"* and you count how many do.

➡️ **Protect this moment in the build.** (See the build note below.)

---

## The three questions (worded to fight bias)

Ask immediately after they read their decode.

1. **Specificity — the killer question** (attacks the horoscope failure mode):
   > "Reading that back — could this have been written about anyone's rejection,
   > or did it feel like it was about *yours*?"

   People will say "it felt generic" far more readily than "it was bad" — it's a
   comment on the text, not a judgment of you. A generic-feeling decode is dead.

2. **Non-obvious — separates accuracy from usefulness:**
   > "Was there anything in there you hadn't already worked out yourself?"

   If the honest answer is mostly "no, I knew all that," the decode isn't adding
   value *even if it's accurate.*

3. **Forward behavioral proxy — resist asking about money:**
   > "Next time you get a rejection, would you bother pasting it in here?
   > Be honest — it's fine if not."

   The "be honest, fine if not" permission lowers the social cost of "no" so the
   yes actually means something.

---

## How to run it so the signal is clean

- **Watch live if you possibly can.** ~10 min on a call, screen shared, you
  silent. Hesitation, re-reading, frowning, skimming — data no survey captures.
  - **Landed:** they go quiet and read the decode *twice.*
  - **Didn't:** they skim and move on.
  - Five live sessions teach you more than fifteen async survey responses.
- **Don't lead.** Never "we think the interview-stage detection is cool." Hand
  them the paste box and shut up.

---

## The bar — committed BEFORE seeing results

Of 20 participants:

| Signal | Bar to "decode lands" |
|--------|----------------------|
| Felt **specific to them** (Q1) | **≥ 12 / 20** |
| Found something **non-obvious** (Q2) | **≥ 10 / 20** |
| Would **paste again** (Q3) | **≥ 10 / 20** |
| Voluntary **second paste** (behavior) | watch — any meaningful rate is strong |

**If it clears the bar:** the decode is real. Do the parked cleanup, build out.

**If specificity is ~half or below:** the decode quality itself is the problem.
No infrastructure, no cleanup, no landing-page work matters until the actual
analysis is fixed. That's the finding — act on it, don't explain it away.

*(Adjust these numbers if you have reason to — but only now, in writing, before
results. Not after.)*

---

## The hard part: recruiting

The cleanest protocol does nothing without 20 real job-seekers with real
rejections. This is where these tests stall. Recruiting plan:

- [ ] _(fill in — see channels discussion)_

---

## Build note — protect the second-paste moment

Before running, confirm the decode flow offers an explicit *"Got another?
Paste it"* after the first result, and that you can count second pastes (even
just by watching in live sessions). This is the highest-value signal in the
test; don't let the UI bury it.

**STATUS (checked 2026-06-11): the moment does NOT exist yet.**
`RejectionDecoder.tsx` renders the result below the input with no "decode
another" affordance; the email textarea isn't even cleared on success, so a
second paste means scrolling up, manually clearing, and re-pasting — friction,
not an invitation. This is a small, pre-test build item ON the test's critical
path (unlike the parked front-door/dedup cleanup). Add an explicit
*"Got another? Paste it →"* CTA after a successful decode that clears the box
and refocuses it, before running the test.
