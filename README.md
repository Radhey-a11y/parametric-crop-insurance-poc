# Farm Insurance PoC

Hardhat project for a decentralized parametric micro-insurance demo. The smart contracts are deployed on a local Hardhat network, and the browser dApp uses MetaMask and ethers.js v6.

## Prerequisites

- Node.js and npm
- MetaMask
- A working Hardhat 2 project with `MockUSDC` and `ParametricInsurance`
- Dependencies installed: `npm install`

## 1. Start the local blockchain

Open a terminal in the project folder and run:

```bash
npx hardhat node
```

Keep this terminal running. Hardhat prints 20 test accounts and private keys. The demo uses:

- Account #0: contract owner and pool funder
- Account #1: oracle
- Account #2: farmer

## 2. Deploy the contracts

Open a second terminal and run your existing deployment script:

```bash
npx hardhat run <your-deploy-script> --network localhost
```

The deployment output should include the deployed `MockUSDC` address and `ParametricInsurance` address. Copy both addresses.

## 3. Configure MetaMask

Add the Hardhat network to MetaMask:

- Network name: `Hardhat Local`
- RPC URL: `http://127.0.0.1:8545`
- Chain ID: `31337`
- Currency symbol: `ETH`

You can also click **Switch to Hardhat network** in the dApp. The button calls `wallet_addEthereumChain` and `wallet_switchEthereumChain`.

To import demo accounts:

1. In MetaMask, open Account menu > Add account or hardware wallet > Import account.
2. Copy account #0/#1/#2 private keys from the `npx hardhat node` terminal.
3. Import them as separate MetaMask accounts.
4. Never reuse these accounts outside local development.

## 4. Configure the frontend

The configured frontend addresses are already set in `frontend/app.js`:

```javascript
const USDC_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const INSURANCE_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
```

If the Hardhat node is restarted, redeploy and replace only these two address values. No contract source, test, or deployment script needs to be changed for the frontend.

## 5. Start the dApp

From the project folder:

```bash
npx serve frontend
```

Open the URL printed by `serve` (normally `http://localhost:3000`) in the browser with MetaMask installed.

## Live demo script

### A. Fund the insurance pool

1. Import account #0 and connect MetaMask.
2. Switch MetaMask to Hardhat Local.
3. Click **Connect MetaMask** in the dApp.
4. Enter a pool amount, such as `1000` mUSDC.
5. Click **Fund Pool**. MetaMask first asks for ERC20 approval and then sends `fundPool`; both steps are confirmed separately.
6. Confirm that Vault balance and reserved amount update in the Pool panel.

### B. Mint test mUSDC and buy a policy

1. Switch MetaMask to account #2 (the farmer).
2. Connect or switch accounts in the dApp.
3. Click **Get 1000 test mUSDC** and approve the mint transaction.
4. Enter a location, for example `Nashik, Maharashtra`.
5. Enter a rainfall threshold, for example `50` mm.
6. Enter a payout, for example `100` mUSDC.
7. Enter a duration, for example `30` days.
8. Verify that the premium preview shows `10 mUSDC` (10% of the payout).
9. Click **Buy Policy**. MetaMask asks for premium approval, then creates the policy.
10. Policy #1 appears in the Policies table with Active status.

### C. Simulate drought as the oracle

1. Switch MetaMask to account #1 (the oracle).
2. In the dApp, confirm the orange Demo Override panel says the oracle account is connected.
3. Enter policy ID `1`.
4. Enter actual rainfall below the threshold, for example `20` mm for a 50 mm threshold.
5. Click **Report Weather**.
6. The transaction calls `fulfillWeatherData`; it should emit `WeatherReported` and `PayoutExecuted`.
7. The Policy table changes to Paid Out.
8. The Event Log shows the wallet balance before and after payout for the farmer.

### D. Finish the walkthrough

1. Switch back to account #2 to show the farmer's updated mUSDC balance.
2. Refresh the policy table if needed.
3. Explain that normal weather at or above the threshold closes the policy without payout, and that `expirePolicy` is used once the policy period expires.

## Frontend behavior

- Pool balance is the insurance contract's mUSDC balance.
- Reserved amount is the insurance contract's reserved payout liability.
- Policy status is Paid Out, Closed - No Payout, Expired, or Active based on contract state and expiry time.
- Buying a policy approves only the 10% premium and then calls `createPolicy`.
- Funding approves the pool amount and then calls `fundPool`.
- Contract revert reasons and button loading states are shown in the UI.

