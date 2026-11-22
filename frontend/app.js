// Paste the deployed contract addresses here. Everything else is configured below.
const USDC_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const INSURANCE_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

// Minimal ERC20 interface. 6 decimals keep all pool, premium and payout values in mUSDC units.
const USDC_ABI = [
  "function mint(address to, uint256 amount)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

// Minimal insurance interface plus the three demo event types.
const INSURANCE_ABI = [
  "function token() view returns (address)",
  "function owner() view returns (address)",
  "function oracle() view returns (address)",
  "function reserved() view returns (uint256)",
  "function policyCount() view returns (uint256)",
  "function PREMIUM_BPS() view returns (uint256)",
  "function fundPool(uint256 amount)",
  "function createPolicy(string location, uint256 rainfallThreshold, uint256 payout, uint256 durationDays) returns (uint256)",
  "function fulfillWeatherData(uint256 id, uint256 actualRainfall)",
  "function expirePolicy(uint256 id)",
  "function policies(uint256 id) view returns (address holder, string location, uint256 rainfallThreshold, uint256 payout, uint256 premium, uint256 expiry, bool settled, bool paidOut)",
  "event PoolFunded(address indexed provider, uint256 amount)",
  "event PolicyCreated(uint256 indexed id, address indexed holder, string location, uint256 threshold, uint256 payout)",
  "event WeatherReported(uint256 indexed id, uint256 actualRainfall)",
  "event PayoutExecuted(uint256 indexed id, address indexed holder, uint256 payout)",
  "event PolicyExpired(uint256 indexed id)"
];

const HARDHAT_CHAIN_ID = "0x7a69";
const HARDHAT_CONFIG = {
  chainId: HARDHAT_CHAIN_ID,
  chainName: "Hardhat Local",
  nativeCurrency: { name: "Hardhat Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: ["http://127.0.0.1:8545"]
};

let provider;
let signer;
let account;
let usdc;
let insurance;
let oracleAddress;
let listenersInstalled = false;
const payoutSnapshots = new Map();
const DEMO_ACCOUNTS = {
  owner: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266".toLowerCase(),
  oracle: "0x70997970C51812dc3A010C7D01b50e0d17dc79C8".toLowerCase(),
  farmer: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC".toLowerCase()
};

const $ = (id) => document.getElementById(id);

function addressesConfigured() {
  return ethers.isAddress(USDC_ADDRESS) && ethers.isAddress(INSURANCE_ADDRESS);
}

function shortAddress(address) {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "—";
}

async function updateNetworkBadge() {
  const badge = $("networkBadge");
  if (!window.ethereum) {
    badge.className = "network-badge offline";
    $("networkText").textContent = "MetaMask unavailable";
    return;
  }
  try {
    const chainId = await window.ethereum.request({ method: "eth_chainId" });
    const isHardhat = chainId.toLowerCase() === HARDHAT_CHAIN_ID;
    badge.className = `network-badge ${isHardhat ? "online" : "offline"}`;
    $("networkText").textContent = isHardhat ? "Hardhat Local" : `Wrong network · ${chainId}`;
  } catch (_) {
    badge.className = "network-badge offline";
    $("networkText").textContent = "Network unavailable";
  }
}

function showMessage(message, isError = true) {
  showToast(message, isError ? "error" : "success");
}

function clearMessage() {}

// Toasts replace old in-page banners so transaction feedback stays visible on any section.
function showToast(message, type = "info") {
  const container = $("toastContainer");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  window.setTimeout(() => toast.remove(), type === "error" ? 6500 : 4200);
}

// ethers supplies a human-readable revert; this extracts the most useful short reason.
function friendlyError(error) {
  const reason = error?.reason || error?.info?.error?.message || error?.error?.message || error?.shortMessage || error?.message || "Transaction failed";
  return reason.replace(/^execution reverted:? ?/i, "").replace(/^VM Exception while processing transaction: revert ?/i, "");
}

function setLoading(button, loading, text) {
  if (!button.dataset.originalText) button.dataset.originalText = button.textContent;
  button.disabled = loading;
  button.classList.toggle("loading", loading);
  button.textContent = loading ? text : button.dataset.originalText;
}

async function withTransaction(button, loadingText, action) {
  clearMessage();
  setLoading(button, true, loadingText);
  try {
    const tx = await action();
    showMessage(`Transaction submitted: ${tx.hash}`, false);
    await tx.wait();
    showMessage("Transaction confirmed.", false);
    await refreshAll();
    return tx;
  } catch (error) {
    showMessage(`Error: ${friendlyError(error)}`);
  } finally {
    setLoading(button, false);
  }
}

async function connectWallet() {
  if (!window.ethereum) {
    showMessage("MetaMask is not installed. Install the MetaMask browser extension first.");
    return;
  }
  try {
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    account = accounts[0];
    provider = new ethers.BrowserProvider(window.ethereum);
    signer = await provider.getSigner();
    account = await signer.getAddress();

    if (!addressesConfigured()) {
      showMessage("Paste valid USDC_ADDRESS and INSURANCE_ADDRESS values in frontend/app.js first.");
    } else {
      usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, signer);
      insurance = new ethers.Contract(INSURANCE_ADDRESS, INSURANCE_ABI, signer);
      oracleAddress = await insurance.oracle();
      installEventListeners();
    }

    $("connectButton").textContent = "Connected";
    await refreshAll();
  } catch (error) {
    showMessage(`Could not connect: ${friendlyError(error)}`);
  }
}

async function refreshAll() {
  if (!account) return;
  if (!addressesConfigured()) {
    $("walletInfo").textContent = `${shortAddress(account)} | Addresses not configured`;
    return;
  }
  try {
    usdc = usdc || new ethers.Contract(USDC_ADDRESS, USDC_ABI, signer);
    insurance = insurance || new ethers.Contract(INSURANCE_ADDRESS, INSURANCE_ABI, signer);

    const [balance, vaultBalance, reserved, count, oracle] = await Promise.all([
      usdc.balanceOf(account),
      usdc.balanceOf(INSURANCE_ADDRESS),
      insurance.reserved(),
      insurance.policyCount(),
      insurance.oracle()
    ]);
    oracleAddress = oracle;
    $("walletInfo").innerHTML = `<span class="wallet-icon">◈</span><span>${shortAddress(account)} · ${ethers.formatUnits(balance, 6)} mUSDC</span>`;

    const roleAddress = account.toLowerCase();
    const roleLabel = $("roleLabel");
    roleLabel.className = "role-label";
    if (roleAddress === DEMO_ACCOUNTS.owner) { roleLabel.innerHTML = "You are connected as: <strong>Owner</strong>"; roleLabel.classList.add("owner"); }
    else if (roleAddress === DEMO_ACCOUNTS.farmer) { roleLabel.innerHTML = "You are connected as: <strong>Farmer</strong>"; roleLabel.classList.add("farmer"); }
    else if (roleAddress === DEMO_ACCOUNTS.oracle) { roleLabel.innerHTML = "You are connected as: <strong>Oracle</strong>"; roleLabel.classList.add("oracle"); }
    else { roleLabel.innerHTML = "You are connected as: <strong>Demo wallet</strong>"; }

    $("vaultBalance").textContent = `${ethers.formatUnits(vaultBalance, 6)} mUSDC`;
    $("reservedAmount").textContent = `${ethers.formatUnits(reserved, 6)} mUSDC`;
    $("policyCount").textContent = count.toString();

    const isOracle = account.toLowerCase() === oracleAddress.toLowerCase();
    $("oracleStatus").textContent = isOracle
      ? `Oracle account connected: ${shortAddress(account)} — weather reporting is enabled.`
      : `Not the oracle account. Switch to ${shortAddress(oracleAddress)} to report weather.`;

    await renderPolicies(count);
  } catch (error) {
    showMessage(`Could not refresh on-chain data: ${friendlyError(error)}`);
  }
}

async function renderPolicies(count) {
  const body = $("policiesBody");
  const dropdown = $("weatherPolicyId");
  dropdown.innerHTML = '<option value="">Select a policy</option>';
  if (!count || count === 0n) {
    body.innerHTML = '<tr><td colspan="6" class="empty-state">No policies created yet.</td></tr>';
    return;
  }

  const now = BigInt(Math.floor(Date.now() / 1000));
  const rows = [];
  for (let i = 1n; i <= count; i++) {
    const policy = await insurance.policies(i);
    const holder = policy[0];
    let status = "Active";
    let statusClass = "active";
    if (policy[7]) { status = "Paid Out"; statusClass = "paid"; }
    else if (policy[6]) { status = "Closed - No Payout"; statusClass = "closed"; }
    else if (now >= policy[5]) { status = "Expired"; statusClass = "expired"; }

    if (status === "Active") dropdown.insertAdjacentHTML("beforeend", `<option value="${i}">Policy #${i} — ${escapeHtml(policy[1])}</option>`);

    rows.push(`<tr id="policy-row-${i}">
      <td>${i}</td>
      <td title="${holder}">${shortAddress(holder)}</td>
      <td>${escapeHtml(policy[1])}</td>
      <td>${policy[2].toString()} mm</td>
      <td>${ethers.formatUnits(policy[3], 6)} mUSDC</td>
      <td><span class="status ${statusClass}">${status}</span></td>
    </tr>`);
  }
  body.innerHTML = rows.join("");
}

function escapeHtml(value) {
  const span = document.createElement("span");
  span.textContent = value;
  return span.innerHTML;
}

function updatePremiumPreview() {
  const payoutInput = $("payout").value;
  if (!payoutInput || Number(payoutInput) < 0) {
    $("premiumPreview").textContent = "— mUSDC";
    $("payoutPreview").textContent = "— mUSDC";
    return;
  }
  try {
    const payout = ethers.parseUnits(payoutInput, 6);
    const premium = payout * 1000n / 10000n;
    $("premiumPreview").textContent = `${ethers.formatUnits(premium, 6)} mUSDC`;
    $("payoutPreview").textContent = `${ethers.formatUnits(payout, 6)} mUSDC`;
  } catch (_) {
    $("premiumPreview").textContent = "Invalid amount";
    $("payoutPreview").textContent = "Invalid amount";
  }
}

async function switchToHardhat() {
  if (!window.ethereum) return showMessage("MetaMask is not installed.");
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: HARDHAT_CHAIN_ID }] });
    await updateNetworkBadge();
  } catch (error) {
    if (error.code === 4902) {
      try {
        await window.ethereum.request({ method: "wallet_addEthereumChain", params: [HARDHAT_CONFIG] });
        await updateNetworkBadge();
      } catch (addError) {
        showMessage(`Could not add Hardhat network: ${friendlyError(addError)}`);
      }
    } else {
      showMessage(`Could not switch network: ${friendlyError(error)}`);
    }
  }
}

function addLog(title, detail, type = "weather") {
  const log = $("eventLog");
  const empty = log.querySelector(".empty-feed");
  if (empty) empty.remove();
  const icons = { created: "＋", weather: "☁", payout: "✓" };
  const entry = document.createElement("div");
  entry.className = `event-item ${type}`;
  entry.innerHTML = `<div class="event-icon">${icons[type]}</div><div class="event-copy"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span></div><time>${new Date().toLocaleTimeString()}</time>`;
  log.prepend(entry);
}

function installEventListeners() {
  if (listenersInstalled) return;
  listenersInstalled = true;

  insurance.on("PolicyCreated", async (id, holder, location, threshold, payout) => {
    const premium = payout * 1000n / 10000n;
    addLog(`PolicyCreated · #${id}`, `${shortAddress(holder)} · ${location} · threshold ${threshold} mm · payout ${ethers.formatUnits(payout, 6)} mUSDC · premium ${ethers.formatUnits(premium, 6)} mUSDC`, "created");
    await refreshAll();
  });

  insurance.on("WeatherReported", async (id, actualRainfall) => {
    addLog(`WeatherReported · Policy #${id}`, `Actual rainfall ${actualRainfall} mm`, "weather");
    await refreshAll();
  });

  insurance.on("PayoutExecuted", async (id, holder, payout) => {
    const snapshot = payoutSnapshots.get(id.toString());
    const after = await usdc.balanceOf(holder);
    if (snapshot) {
      addLog(`PayoutExecuted · Policy #${id}`, `Farmer ${ethers.formatUnits(snapshot.before, 6)} mUSDC BEFORE → ${ethers.formatUnits(after, 6)} mUSDC AFTER`, "payout");
    } else {
      addLog(`PayoutExecuted · Policy #${id}`, `${shortAddress(holder)} received ${ethers.formatUnits(payout, 6)} mUSDC`, "payout");
    }
    payoutSnapshots.delete(id.toString());
    showToast(`Payout successful: ${ethers.formatUnits(payout, 6)} mUSDC for policy #${id}`, "success");
    $("vaultCard")?.classList.add("highlight-green");
    window.setTimeout(() => $("vaultCard")?.classList.remove("highlight-green"), 1900);
    await refreshAll();
    const row = $(`policy-row-${id}`);
    if (row) { row.classList.add("policy-highlight"); window.setTimeout(() => row.classList.remove("policy-highlight"), 2400); }
  });
}

async function handleMint(button) {
  if (!account) return showMessage("Connect MetaMask first.");
  await withTransaction(button, "Minting…", async () => {
    const tx = await usdc.mint(account, ethers.parseUnits("1000", 6));
    return tx;
  });
}

async function handleFund(event) {
  event.preventDefault();
  if (!account) return showMessage("Connect MetaMask first.");
  const button = $("fundButton");
  const amount = ethers.parseUnits($("fundAmount").value, 6);
  await withTransaction(button, "Approving…", async () => {
    const approval = await usdc.approve(INSURANCE_ADDRESS, amount);
    await approval.wait();
    setLoading(button, true, "Funding…");
    return insurance.fundPool(amount);
  });
}

async function handleBuyPolicy(event) {
  event.preventDefault();
  if (!account) return showMessage("Connect MetaMask first.");
  const button = $("policyButton");
  const location = $("location").value.trim();
  const threshold = BigInt($("rainfall").value);
  const payout = ethers.parseUnits($("payout").value, 6);
  const duration = BigInt($("duration").value);
  const premium = payout * 1000n / 10000n;

  await withTransaction(button, "Approving premium…", async () => {
    const approval = await usdc.approve(INSURANCE_ADDRESS, premium);
    await approval.wait();
    setLoading(button, true, "Buying policy…");
    return insurance.createPolicy(location, threshold, payout, duration);
  });
}

async function handleWeather(event) {
  event.preventDefault();
  if (!account) return showMessage("Connect MetaMask first.");
  if (!oracleAddress) await refreshAll();
  if (account.toLowerCase() !== oracleAddress.toLowerCase()) {
    return showMessage(`This wallet is not the oracle. Switch MetaMask to the oracle account: ${oracleAddress}`);
  }

  const id = BigInt($("weatherPolicyId").value);
  const rainfall = BigInt($("actualRainfall").value);
  const button = $("weatherButton");

  await withTransaction(button, "Checking wallet…", async () => {
    const policy = await insurance.policies(id);
    const holder = policy[0];
    payoutSnapshots.set(id.toString(), { before: await usdc.balanceOf(holder) });
    setLoading(button, true, "Reporting weather…");
    return insurance.fulfillWeatherData(id, rainfall);
  });
}

window.addEventListener("load", () => {
  $("connectButton").addEventListener("click", connectWallet);
  $("networkButton").addEventListener("click", switchToHardhat);
  $("mintButton").addEventListener("click", (event) => handleMint(event.currentTarget));
  $("fundForm").addEventListener("submit", handleFund);
  $("policyForm").addEventListener("submit", handleBuyPolicy);
  $("weatherForm").addEventListener("submit", handleWeather);
  $("refreshButton").addEventListener("click", refreshAll);
  $("payout").addEventListener("input", updatePremiumPreview);
  updateNetworkBadge();

  if (window.ethereum) {
    window.ethereum.on("accountsChanged", (accounts) => {
      account = accounts[0] || null;
      if (!account) {
        $("walletInfo").textContent = "Not connected";
        $("policiesBody").innerHTML = '<tr><td colspan="6" class="empty">Connect MetaMask to load policies.</td></tr>';
        return;
      }
      signer = null;
      usdc = null;
      if (insurance) insurance.removeAllListeners();
      insurance = null;
      listenersInstalled = false;
      connectWallet();
    });
    window.ethereum.on("chainChanged", () => window.location.reload());
  }

  if (!addressesConfigured()) {
    showMessage("Set USDC_ADDRESS and INSURANCE_ADDRESS in frontend/app.js before using the dApp.");
  }
});
