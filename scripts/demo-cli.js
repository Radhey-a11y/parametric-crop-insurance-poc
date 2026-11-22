const { ethers } = require("hardhat");

const USDC_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const INSURANCE_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

async function main() {
  const [, oracle, farmer] = await ethers.getSigners();
  const usdc = await ethers.getContractAt("MockUSDC", USDC_ADDRESS, farmer);
  const insurance = await ethers.getContractAt("ParametricInsurance", INSURANCE_ADDRESS);

  console.log("Step 1: Mint 1000 test mUSDC for the farmer (account #2)");
  await (await usdc.mint(farmer.address, ethers.parseUnits("1000", 6))).wait();

  console.log("Step 2: Approve the insurance contract for the policy premium");
  const payout = ethers.parseUnits("500", 6);
  const premium = (payout * 1000n) / 10000n;
  await (await usdc.approve(INSURANCE_ADDRESS, premium)).wait();

  console.log("Step 3: Buy policy 1 (Mandya, threshold 50 mm, payout 500 mUSDC, 30 days)");
  const previousCount = await insurance.policyCount();
  await (await insurance.connect(farmer).createPolicy("Mandya", 50, payout, 30)).wait();

  const policyId = await insurance.policyCount();
  if (policyId !== previousCount + 1n) {
    throw new Error(`Unexpected policy ID: expected ${previousCount + 1n}, received ${policyId}`);
  }

  const balanceBefore = await usdc.balanceOf(farmer.address);
  console.log(`Farmer balance before payout: ${ethers.formatUnits(balanceBefore, 6)} mUSDC`);

  console.log("Step 4: Oracle account #1 reports actual rainfall of 20 mm");
  await (await insurance.connect(oracle).fulfillWeatherData(policyId, 20)).wait();

  const balanceAfter = await usdc.balanceOf(farmer.address);
  const policy = await insurance.policies(policyId);

  console.log(`Farmer balance after payout: ${ethers.formatUnits(balanceAfter, 6)} mUSDC`);
  console.log(`Policy #${policyId} status: ${policy.paidOut ? "Paid Out" : "Not Paid Out"}`);
  console.log(`New policy count: ${await insurance.policyCount()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
