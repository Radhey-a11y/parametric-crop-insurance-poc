const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
describe("ParametricInsurance", function () {
  let usdc, ins, owner, oracle, farmer, other;
  const U = (n) => ethers.parseUnits(n.toString(), 6);
  beforeEach(async () => {
    [owner, oracle, farmer, other] = await ethers.getSigners();
    usdc = await (await ethers.getContractFactory("MockUSDC")).deploy();
    ins = await (await ethers.getContractFactory("ParametricInsurance")).deploy(await usdc.getAddress(), oracle.address);
    const addr = await ins.getAddress();
    await usdc.mint(owner.address, U(100000));
    await usdc.mint(farmer.address, U(1000));
    await usdc.approve(addr, U(50000));
    await ins.fundPool(U(50000));
    await usdc.connect(farmer).approve(addr, U(1000));
    await ins.connect(farmer).createPolicy("Mandya", 50, U(500), 30);
  });
  it("pays the farmer when rainfall is below threshold", async () => {
    await ins.connect(oracle).fulfillWeatherData(1, 20);
    expect(await usdc.balanceOf(farmer.address)).to.equal(U(1450));
  });
  it("does not pay when rainfall is above threshold", async () => {
    await ins.connect(oracle).fulfillWeatherData(1, 80);
    expect(await usdc.balanceOf(farmer.address)).to.equal(U(950));
  });
  it("only the oracle can submit weather data", async () => {
    await expect(ins.connect(other).fulfillWeatherData(1, 10)).to.be.revertedWith("Not oracle");
  });
  it("policy can be expired after the duration", async () => {
    await time.increase(31 * 24 * 3600);
    await ins.expirePolicy(1);
    expect((await ins.policies(1)).settled).to.equal(true);
  });
});
