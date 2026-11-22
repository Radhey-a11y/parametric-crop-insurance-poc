const { ethers } = require("hardhat");
async function main() {
  const [owner, oracle] = await ethers.getSigners();
  const usdc = await (await ethers.getContractFactory("MockUSDC")).deploy();
  await usdc.waitForDeployment();
  const ins = await (await ethers.getContractFactory("ParametricInsurance")).deploy(await usdc.getAddress(), oracle.address);
  await ins.waitForDeployment();
  await usdc.mint(owner.address, ethers.parseUnits("100000", 6));
  await usdc.approve(await ins.getAddress(), ethers.parseUnits("50000", 6));
  await ins.fundPool(ethers.parseUnits("50000", 6));
  console.log("MockUSDC:", await usdc.getAddress());
  console.log("Insurance:", await ins.getAddress());
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
