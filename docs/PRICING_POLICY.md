# Pricing Policy (Owner Directive Capture)

Status: captured, pending explicit repricing sign-off.

## Current Directive

- Premium lootbox target: around `$0.50` when `MON=$0.02`.
- Derived base target: `25 MON` equivalent for base premium price.
- Commit fee, RFQ create fee, and trade create fee are not primary sink targets.

## Contract Follow-Up (After Sign-Off)

1. Update `LOOTBOX_BASE_PRICE` in contracts from `0.001 ether` to policy target.
2. Re-run full contract and middleware balance/economy simulations.
3. Re-run CI parity:
   - contracts: format/build/size/tests
   - middleware: lint/test/build
4. Validate MCP economics outputs (`quote_premium_purchase`, `estimate_epoch_roi`) against updated constants.
5. Only then promote to deploy branch.

## Verification Requirement

- Repricing is considered complete only when target is codified in-contract and test-backed before deploy.
