// Read-only local block explorer. It does not change contract state or send transactions.
(() => {
  const RPC = "http://127.0.0.1:8545";
  const USDC_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
  const INSURANCE_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
  const provider = new ethers.JsonRpcProvider(RPC);

  const insuranceAbi = [
    "function owner() view returns (address)", "function oracle() view returns (address)",
    "function reserved() view returns (uint256)", "function policyCount() view returns (uint256)",
    "function policies(uint256 id) view returns (address holder, string location, uint256 rainfallThreshold, uint256 payout, uint256 premium, uint256 expiry, bool settled, bool paidOut)",
    "function fundPool(uint256 amount)", "function createPolicy(string location, uint256 rainfallThreshold, uint256 payout, uint256 durationDays) returns (uint256)",
    "function fulfillWeatherData(uint256 id, uint256 actualRainfall)", "function expirePolicy(uint256 id)",
    "event PoolFunded(address indexed provider, uint256 amount)",
    "event PolicyCreated(uint256 indexed id, address indexed holder, string location, uint256 threshold, uint256 payout)",
    "event WeatherReported(uint256 indexed id, uint256 actualRainfall)",
    "event PayoutExecuted(uint256 indexed id, address indexed holder, uint256 payout)",
    "event PolicyExpired(uint256 indexed id)"
  ];
  const usdcAbi = [
    "function mint(address to, uint256 amount)", "function approve(address spender, uint256 amount)",
    "function balanceOf(address account) view returns (uint256)", "function transfer(address to, uint256 amount)",
    "event Transfer(address indexed from, address indexed to, uint256 value)",
    "event Approval(address indexed owner, address indexed spender, uint256 value)"
  ];
  const insurance = new ethers.Contract(INSURANCE_ADDRESS, insuranceAbi, provider);
  const usdc = new ethers.Contract(USDC_ADDRESS, usdcAbi, provider);
  const insuranceIface = new ethers.Interface(insuranceAbi);
  const usdcIface = new ethers.Interface(usdcAbi);

  let lastBlock = null;
  const accountsSeen = new Set();

  const $ = (id) => document.getElementById(id);
  const short = (value, left = 8, right = 6) => value ? `${value.slice(0, left)}…${value.slice(-right)}` : "—";
  const timeText = (timestamp) => new Date(Number(timestamp) * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  function setOffline(offline) {
    $("nodeStatus").className = `live-badge ${offline ? "offline" : "live"}`;
    $("nodeStatus").innerHTML = `<i></i> ${offline ? "Offline" : "Live"}`;
    $("explorerOfflineBanner").hidden = !offline;
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); if (window.showToast) window.showToast("Copied to clipboard", "success"); }
    catch (_) { window.prompt("Copy address", text); }
  }

  async function readContractState() {
    try {
      const [owner, oracle, reserved, count, vault] = await Promise.all([
        insurance.owner(), insurance.oracle(), insurance.reserved(), insurance.policyCount(), usdc.balanceOf(INSURANCE_ADDRESS)
      ]);
      $("chainOwner").textContent = owner;
      $("chainOracle").textContent = oracle;
      $("chainReserved").textContent = `${ethers.formatUnits(reserved, 6)} mUSDC`;
      $("chainPolicyCount").textContent = count.toString();
      $("chainVault").textContent = `${ethers.formatUnits(vault, 6)} mUSDC`;
      if ($("homeVaultBalance") && $("homeReserved") && $("homePolicyCount")) {
        $("homeVaultBalance").textContent = `${ethers.formatUnits(vault, 6)} mUSDC`;
        $("homeReserved").textContent = `${ethers.formatUnits(reserved, 6)} mUSDC`;
        $("homePolicyCount").textContent = count.toString();
      }
    } catch (_) { setOffline(true); }
  }

  async function readCodeAndState() {
    try {
      const [insuranceCode, usdcCode] = await Promise.all([provider.getCode(INSURANCE_ADDRESS), provider.getCode(USDC_ADDRESS)]);
      $("insuranceCode").textContent = insuranceCode === "0x" ? "No code" : `Contract deployed · ${(insuranceCode.length - 2) / 2} bytes`;
      $("insuranceCode").className = `deployment-badge ${insuranceCode === "0x" ? "offline" : "deployed"}`;
      $("usdcCode").textContent = usdcCode === "0x" ? "No code" : `Contract deployed · ${(usdcCode.length - 2) / 2} bytes`;
      $("usdcCode").className = `deployment-badge ${usdcCode === "0x" ? "offline" : "deployed"}`;
    } catch (_) {}
  }

  async function refreshBlocks() {
    try {
      const latest = await provider.getBlockNumber();
      setOffline(false);
      $("latestBlockNumber").textContent = `#${latest}`;
      $("blockChip").textContent = `⛓ Block #${latest}`;
      if (lastBlock !== null && latest > lastBlock) $("latestBlockNumber").classList.add("block-pop");
      setTimeout(() => $("latestBlockNumber").classList.remove("block-pop"), 900);
      lastBlock = latest;

      const gas = await provider.getFeeData();
      $("gasPrice").textContent = gas.gasPrice ? `${ethers.formatUnits(gas.gasPrice, "gwei")} gwei` : "—";
      $("accountsSeen").textContent = accountsSeen.size;

      const blocks = await Promise.all(Array.from({length: 10}, (_, i) => latest - i).filter(n => n >= 0).map(n => provider.getBlock(n)));
      $("blocksTable").innerHTML = blocks.filter(Boolean).map((b, i) => `<tr class="${i === 0 && lastBlock === latest ? "new-row" : ""}"><td class="mono">#${b.number}</td><td>${timeText(b.timestamp)}</td><td>${b.transactions.length}</td><td>${b.gasUsed.toString()}</td><td><button class="hash-copy" data-copy="${b.hash}">${short(b.hash)}</button></td></tr>`).join("");
      bindCopyButtons();
    } catch (_) { setOffline(true); }
  }

  async function refreshTransactions() {
    try {
      const latest = await provider.getBlockNumber();
      const found = [];
      for (let blockNumber = latest; blockNumber >= 0 && found.length < 20; blockNumber--) {
        const block = await provider.getBlock(blockNumber, true);
        if (!block) continue;
        for (const tx of block.transactions.reverse()) {
          const to = tx.to?.toLowerCase();
          if (to !== INSURANCE_ADDRESS.toLowerCase() && to !== USDC_ADDRESS.toLowerCase()) continue;
          const receipt = await provider.getTransactionReceipt(tx.hash);
          if (receipt) accountsSeen.add(tx.from);
          found.push({ tx, receipt });
          if (found.length >= 20) break;
        }
        if (latest - blockNumber > 500) break;
      }
      $("accountsSeen").textContent = accountsSeen.size;
      $("transactionsTable").innerHTML = found.length ? found.map((item) => {
        const {tx, receipt} = item;
        let decoded = "—";
        try {
          const iface = tx.to?.toLowerCase() === USDC_ADDRESS.toLowerCase() ? usdcIface : insuranceIface;
          const parsed = iface.parseTransaction({ data: tx.data, value: tx.value });
          decoded = parsed?.name || "—";
        } catch (_) {}
        const status = receipt ? (receipt.status === 1 ? '<span class="tx-success">Success</span>' : '<span class="tx-failed">Failed</span>') : "Pending";
        const toLabel = tx.to?.toLowerCase() === INSURANCE_ADDRESS.toLowerCase() ? "ParametricInsurance" : tx.to?.toLowerCase() === USDC_ADDRESS.toLowerCase() ? "MockUSDC" : short(tx.to);
        return `<tr class="tx-row" data-hash="${tx.hash}"><td><button class="hash-copy" data-copy="${tx.hash}">${short(tx.hash)}</button></td><td>#${tx.blockNumber}</td><td class="mono">${short(tx.from)}</td><td>${toLabel}</td><td>${escapeHtml(decoded)}</td><td>${status}</td><td>${receipt?.gasUsed?.toString() || "—"}</td></tr>`;
      }).join("") : '<tr><td colspan="7">No contract transactions found.</td></tr>';

      bindCopyButtons();
      document.querySelectorAll(".tx-row").forEach(row => row.addEventListener("click", (event) => {
        if (event.target.closest(".hash-copy")) return;
        openTransaction(row.dataset.hash);
      }));
    } catch (_) { setOffline(true); }
  }

  function bindCopyButtons() {
    document.querySelectorAll("[data-copy]").forAll?.();
    document.querySelectorAll(".hash-copy[data-copy],.copy-address[data-copy]").forEach(button => {
      button.onclick = (event) => { event.stopPropagation(); copyText(button.dataset.copy); };
    });
  }

  async function openTransaction(hash) {
    try {
      const [tx, receipt] = await Promise.all([provider.getTransaction(hash), provider.getTransactionReceipt(hash)]);
      if (!tx) return;
      let decodedArgs = "";
      let decodedName = "—";
      try {
        const iface = tx.to?.toLowerCase() === USDC_ADDRESS.toLowerCase() ? usdcIface : insuranceIface;
        const parsed = iface.parseTransaction({ data: tx.data, value: tx.value });
        decodedName = parsed.name;
        decodedArgs = parsed.args.map((arg, i) => `<div><span>${escapeHtml(parsed.fragment.inputs[i]?.name || `arg${i}`)}</span><code>${escapeHtml(arg.toString())}</code></div>`).join("");
      } catch (_) { decodedArgs = '<div><span>Arguments</span><code>Could not decode</code></div>'; }

      const logRows = (receipt?.logs || []).map((log) => {
        let name = "Event"; let args = "";
        try { const iface = log.address.toLowerCase() === USDC_ADDRESS.toLowerCase() ? usdcIface : insuranceIface; const parsed = iface.parseLog(log); name = parsed.name; args = parsed.args.map((arg, i) => `<b>${escapeHtml(parsed.fragment.inputs[i]?.name || i)}:</b> ${escapeHtml(arg.toString())}`).join(" · "); } catch (_) {}
        return `<li><strong>${escapeHtml(name)}</strong><span>${escapeHtml(args || "—")}</span></li>`;
      }).join("");

      $("txDrawerContent").innerHTML = `<div class="drawer-fields"><div><span>Hash</span><code>${escapeHtml(tx.hash)}</code></div><div><span>Nonce</span><strong>${tx.nonce}</strong></div><div><span>From</span><code>${escapeHtml(tx.from)}</code></div><div><span>To</span><code>${escapeHtml(tx.to || "—")}</code></div><div><span>Value</span><strong>${ethers.formatEther(tx.value)} ETH</strong></div><div><span>Gas limit</span><strong>${tx.gasLimit.toString()}</strong></div><div><span>Gas used</span><strong>${receipt?.gasUsed?.toString() || "—"}</strong></div><div><span>Function</span><strong>${escapeHtml(decodedName)}</strong></div></div><details><summary>Input data</summary><code class="input-data">${escapeHtml(tx.data.length > 100 ? tx.data.slice(0,100) + "…" : tx.data)}</code></details><h4>Decoded arguments</h4><div class="decoded-args">${decodedArgs}</div><h4>Event logs</h4><ul class="drawer-events">${logRows || '<li>No events</li>'}</ul>`;
      $("txDrawer").className = "tx-drawer open";
      $("txDrawerBackdrop").className = "drawer-backdrop open";
      $("txDrawer").setAttribute("aria-hidden", "false");
    } catch (_) { setOffline(true); }
  }

  async function refreshPayoutProofAndEvents() {
    try {
      const latest = await provider.getBlockNumber();
      const from = latest > 5000 ? latest - 5000 : 0;
      const [payoutLogs, weatherLogs, allLogs] = await Promise.all([
        provider.getLogs({ address: INSURANCE_ADDRESS, fromBlock: from, toBlock: "latest", topics: [insuranceIface.getEvent("PayoutExecuted").topicHash] }),
        provider.getLogs({ address: INSURANCE_ADDRESS, fromBlock: from, toBlock: "latest", topics: [insuranceIface.getEvent("WeatherReported").topicHash] }),
        provider.getLogs({ address: INSURANCE_ADDRESS, fromBlock: from, toBlock: "latest", topics: [] })
      ]);

      allLogs.sort((a,b) => b.blockNumber - a.blockNumber || b.index - a.index);
      $("eventStream").innerHTML = allLogs.length ? allLogs.slice(0,30).map((log) => {
        let name = "ContractEvent", detail = "";
        try { const parsed = insuranceIface.parseLog(log); name = parsed.name; detail = parsed.args.map((arg,i) => `${parsed.fragment.inputs[i]?.name || i}=${arg}`).join(" · "); } catch (_) {}
        const type = name.toLowerCase();
        return `<div class="stream-item ${type}"><span class="stream-dot"></span><div><strong>${escapeHtml(name)}</strong><small>${escapeHtml(detail)}</small></div><code>${log.transactionHash.slice(0,10)}… · #${log.blockNumber}</code></div>`;
      }).join("") : '<div>No contract events yet.</div>';

      if (!payoutLogs.length) { $("payoutProof").innerHTML = '<p>Waiting for a PayoutExecuted event…</p>'; return; }
      const payoutLog = payoutLogs[payoutLogs.length - 1];
      const payout = insuranceIface.parseLog(payoutLog); const id = payout.args[0]; const farmer = payout.args[1]; const amount = payout.args[2];
      const [policy, weatherBefore] = await Promise.all([
        insurance.policies(id),
        Promise.resolve(weatherLogs.filter(log => insuranceIface.parseLog(log).args[0].toString() === id.toString()).pop())
      ]);
      const threshold = policy[2];
      let rainfall = "—";
      if (weatherBefore) rainfall = insuranceIface.parseLog(weatherBefore).args[1].toString();
      const blockNumber = payoutLog.blockNumber;
      let before = "—", after = "—";
      try {
        const usdcAtProvider = new ethers.Contract(USDC_ADDRESS, usdcAbi, provider);
        const [b, a] = await Promise.all([
          usdcAtProvider.balanceOf(farmer, { blockTag: blockNumber - 1 }),
          usdcAtProvider.balanceOf(farmer, { blockTag: blockNumber })
        ]);
        before = `${ethers.formatUnits(b,6)} mUSDC`; after = `${ethers.formatUnits(a,6)} mUSDC`;
      } catch (_) {}
      $("payoutProof").innerHTML = `<div class="proof-grid"><div><span>Policy ID</span><strong>#${id}</strong></div><div><span>Farmer</span><strong class="mono">${short(farmer,10,8)}</strong></div><div><span>Amount</span><strong>${ethers.formatUnits(amount,6)} mUSDC</strong></div><div><span>Actual rainfall</span><strong>${rainfall} mm</strong></div><div><span>Threshold</span><strong>${threshold} mm</strong></div><div><span>Block</span><strong>#${blockNumber}</strong></div></div><p class="proof-sentence">The contract compared ${rainfall} mm with the threshold of ${threshold} mm and transferred ${ethers.formatUnits(amount,6)} mUSDC automatically.</p><div class="balance-proof"><div><span>Farmer balance before</span><strong>${before}</strong></div><div><span>Farmer balance after</span><strong>${after}</strong></div><button class="hash-copy" data-copy="${payoutLog.transactionHash}">TX ${short(payoutLog.transactionHash)}</button></div>`;
      bindCopyButtons();
    } catch (_) { setOffline(true); }
  }

  async function refreshExplorer() {
    await Promise.all([refreshBlocks(), refreshTransactions(), refreshPayoutProofAndEvents(), readContractState(), readCodeAndState()]);
  }

  window.addEventListener("load", () => {
    $("rereadContracts")?.addEventListener("click", () => { readContractState(); readCodeAndState(); });
    $("closeTxDrawer")?.addEventListener("click", () => { $("txDrawer").className = "tx-drawer"; $("txDrawerBackdrop").className = "drawer-backdrop"; $("txDrawer").setAttribute("aria-hidden", "true"); });
    $("txDrawerBackdrop")?.addEventListener("click", () => $("closeTxDrawer").click());
    document.querySelectorAll(".copy-address").forEach(button => button.addEventListener("click", () => copyText(button.dataset.copy)));
    refreshExplorer();
    setInterval(refreshExplorer, 4000);
  });
  window.addEventListener("verdant:transaction", () => refreshExplorer());
})();
