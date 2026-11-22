# Farm Insurance Live Demo & Viva Cheat Sheet

## 1. Start the demo

1. Keep `npx hardhat node` running in one terminal.
2. Keep the frontend server running:

   ```powershell
   npx serve frontend
   ```

3. Open `http://localhost:3000`.
4. MetaMask network: RPC `http://127.0.0.1:8545`, chain ID `31337`, currency `ETH`.
5. Use only the three test accounts in `demo-accounts.txt`:
   - Account #0: Owner / pool funder
   - Account #1: Oracle
   - Account #2: Farmer

## 2. Live browser flow

1. Import account #0 in MetaMask and connect to the dApp.
2. If the pool needs funding, enter an amount and click `Fund Pool`. Approval is followed by `fundPool`.
3. Switch to account #2 (Farmer), then connect/switch it in MetaMask.
4. Click `Get 1000 test mUSDC` and confirm minting.
5. Enter:
   - Location: `Mandya`
   - Rainfall threshold: `50 mm`
   - Payout: `500 mUSDC`
   - Duration: `30 days`
6. Confirm the displayed premium is `50 mUSDC` (10% of payout).
7. Click `Buy Policy` and approve the premium, then confirm `createPolicy`.
8. Switch to account #1 (Oracle).
9. Enter the new policy ID and actual rainfall `20` in Demo Override.
10. Click `Report Weather`.
11. Confirm:
    - Policy status changes to `Paid Out`
    - Event log shows `PayoutExecuted`
    - Event log highlights farmer balance before and after payout
    - Farmer balance is higher after switching back to account #2

## 3. CLI backup

If the browser demo is unavailable, run:

```powershell
npx hardhat run scripts/demo-cli.js --network localhost
```

This attaches to the already deployed contracts, creates a Mandya policy for signer #2, and lets oracle signer #1 report rainfall of `20 mm`.

## Viva talking points

- mUSDC uses 6 decimals, represented on-chain in base units.
- The 10% premium is `payout * 1000 / 10000`.
- `fundPool` requires ERC20 approval followed by transferFrom.
- `createPolicy` reserves payout, records expiry, and returns the new policy ID.
- `fulfillWeatherData` is restricted to the oracle and settles once.
- Rainfall below the threshold triggers automatic payout; equal or above threshold causes no payout.
- The frontend uses ethers.js v6 and MetaMask RPC provider calls.

## Troubleshooting

- **Wrong network:** use RPC `http://127.0.0.1:8545`, chain ID `31337`, symbol `ETH`. Use `Switch to Hardhat network` if needed.
- **Not oracle:** switch MetaMask to account #1, the address set as oracle during deployment.
- **Node restarted:** the chain resets. Redeploy with `npx hardhat run scripts/deploy.js --network localhost`, paste the new MockUSDC and Insurance addresses into `frontend/app.js`, and restart or refresh the frontend.
- **MetaMask stale chain data:** open MetaMask Settings > Advanced > Clear activity tab data.
- **Transaction fails:** confirm sufficient mUSDC balance and that each ERC20 approval transaction was confirmed.
- **No policy appears:** click `Refresh` or switch accounts to trigger the dApp refresh.
