// Existing demo configuration. Contract addresses and ABIs intentionally remain identical to frontend/app.js.
const USDC_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const INSURANCE_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

const USDC_ABI = [
  "function mint(address to, uint256 amount)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

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
const HARDHAT_CONFIG = {chainId:HARDHAT_CHAIN_ID,chainName:"Hardhat Local",nativeCurrency:{name:"Hardhat Ether",symbol:"ETH",decimals:18},rpcUrls:["http://127.0.0.1:8545"]};
const DEMO_ACCOUNTS = {
  owner:"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266".toLowerCase(),
  oracle:"0x70997970C51812dc3A010C7D01b50e0d17dc79C8".toLowerCase(),
  farmer:"0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC".toLowerCase()
};

let provider, signer, account, usdc, insurance, oracleAddress;
let listenersInstalled = false;
let demoMode = false;
let activeDemoRole = "owner";
// Public Hardhat test keys only. NEVER use these keys on a real network.
const DEMO_PRIVATE_KEYS = {
  owner:"0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  oracle:"0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  farmer:"0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"
};
const payoutSnapshots = new Map();
let wizardGoingBack = false;
let wizardInitialized = false;
const $ = id => document.getElementById(id);

function shortAddress(address){return address ? `${address.slice(0,6)}…${address.slice(-4)}`:"—"}
function friendlyError(error){const reason=error?.reason||error?.info?.error?.message||error?.error?.message||error?.shortMessage||error?.message||"Transaction failed";return reason.replace(/^execution reverted:? ?/i,"").replace(/^VM Exception while processing transaction: revert ?/i,"")}
function escapeHtml(value){const span=document.createElement("span");span.textContent=value||"";return span.innerHTML}
function showToast(message,type="info"){const container=$("toastContainer");const toast=document.createElement("div");toast.className=`toast ${type}`;toast.textContent=message;container.appendChild(toast);setTimeout(()=>toast.remove(),type==="error"?6500:4200)}
function setLoading(button,loading,text){if(!button.dataset.originalText)button.dataset.originalText=button.textContent;button.disabled=loading;button.classList.toggle("button-loading",loading);button.textContent=loading?text:button.dataset.originalText}

async function withTransaction(button,loadingText,action){setLoading(button,true,loadingText);try{const tx=await action();showToast(`Transaction submitted: ${tx.hash}`,"info");const receipt=await tx.wait();showToast(`Transaction confirmed · TX ${tx.hash.slice(0,10)}… · Block #${receipt.blockNumber}`,"success");await refreshAll();window.dispatchEvent(new CustomEvent("verdant:transaction",{detail:{hash:tx.hash,blockNumber:receipt.blockNumber}}));return tx}catch(error){showToast(`Error: ${friendlyError(error)}`,"error")}finally{setLoading(button,false)}}

function showView(viewId){document.querySelectorAll(".view").forEach(view=>view.classList.toggle("active",view.id===viewId));document.querySelectorAll(".nav-links button").forEach(button=>button.classList.toggle("active",button.dataset.view===viewId));$("navLinks").classList.remove("open");window.scrollTo({top:0,behavior:"smooth"})}

async function updateNetwork(){try{const chainId=await window.ethereum.request({method:"eth_chainId"});return chainId.toLowerCase()==HARDHAT_CHAIN_ID}catch(_){return false}}

async function getConnectedChainId(){
  if(window.ethereum){
    try{
      const chainId=await window.ethereum.request({method:"eth_chainId"});
      return Number.parseInt(chainId,16);
    }catch(_){}
  }
  try{
    const chainProvider=new ethers.JsonRpcProvider("http://127.0.0.1:8545");
    const network=await chainProvider.getNetwork();
    return Number(network.chainId);
  }catch(_){return null}
}

async function setActiveSignerContract(){
  if(insurance?.removeAllListeners)insurance.removeAllListeners();
  usdc=new ethers.Contract(USDC_ADDRESS,USDC_ABI,signer);
  insurance=new ethers.Contract(INSURANCE_ADDRESS,INSURANCE_ABI,signer);
  oracleAddress=await insurance.oracle();
  listenersInstalled=false;
  installEventListeners();
  await refreshAll();
}

async function switchMetaMaskAccount(){
  if(demoMode)return showToast("Turn off Demo mode to use MetaMask account switching.","info");
  if(!window.ethereum)return showToast("MetaMask is not installed.","error");
  try{
    await window.ethereum.request({method:"wallet_requestPermissions",params:[{eth_accounts:{}}]});
    const accounts=await window.ethereum.request({method:"eth_requestAccounts"});
    account=accounts[0]||null;
    if(!account)return showToast("No MetaMask account selected.","error");
    provider=new ethers.BrowserProvider(window.ethereum);
    signer=await provider.getSigner();
    account=await signer.getAddress();
    await setActiveSignerContract();
    $("connectButton").textContent="Wallet connected";
    showToast(`Switched to ${shortAddress(account)}.`,"success");
  }catch(error){showToast(`Could not switch account: ${friendlyError(error)}`,"error")}
}

async function switchDemoRole(role){
  if(!demoMode)return;
  const chainId=await getConnectedChainId();
  if(chainId!==31337){
    showToast("Demo mode requires Hardhat chain 31337.","error");
    return;
  }
  activeDemoRole=role;
  try{
    // Public Hardhat test keys only. NEVER use these keys on a real network.
    provider=new ethers.JsonRpcProvider("http://127.0.0.1:8545");
    signer=new ethers.Wallet(DEMO_PRIVATE_KEYS[role],provider);
    account=await signer.getAddress();
    await setActiveSignerContract();
    $("connectButton").textContent="Demo account connected";
    showView(role==="owner"?"fund":role==="oracle"?"weather":"buy");
    showToast(`Demo role switched to ${role[0].toUpperCase()+role.slice(1)}.`,"success");
  }catch(error){showToast(`Could not switch demo role: ${friendlyError(error)}`,"error")}
}

async function setDemoMode(enabled){
  if(enabled){
    const chainId=await getConnectedChainId();
    if(chainId!==31337){
      showToast("Demo mode is only allowed on Hardhat chain 31337.","error");
      $("demoToggle").setAttribute("aria-pressed","false");
      $("demoToggle").classList.remove("active");
      $("demoRoleSelect").disabled=true;
      $("demoModeStatus").textContent="Demo mode unavailable: connect to chain 31337.";
      return false;
    }
  }
  demoMode=enabled;
  $("demoToggle").setAttribute("aria-pressed",String(enabled));
  $("demoToggle").classList.toggle("active",enabled);
  $("demoRoleSelect").disabled=!enabled;
  $("switchAccountButton").disabled=enabled;
  $("demoModeStatus").textContent=enabled?"Demo mode: local test keys":"Demo mode is OFF · MetaMask";
  if(!enabled){
    if(window.ethereum)await connectWallet();
    else{provider=signer=usdc=insurance=null;account=null;$("heroRole").textContent="Connect wallet"}
  }else{
    await switchDemoRole($("demoRoleSelect").value||"owner");
  }
  return enabled;
}

async function connectWallet(){wizardGoingBack=false;if(!window.ethereum){showToast("MetaMask is not installed.","error");return}try{const accounts=await window.ethereum.request({method:"eth_requestAccounts"});account=accounts[0];provider=new ethers.BrowserProvider(window.ethereum);signer=await provider.getSigner();account=await signer.getAddress();usdc=new ethers.Contract(USDC_ADDRESS,USDC_ABI,signer);insurance=new ethers.Contract(INSURANCE_ADDRESS,INSURANCE_ABI,signer);oracleAddress=await insurance.oracle();installEventListeners();$("connectButton").textContent="Wallet connected";await refreshAll();if(!wizardGoingBack&&await updateNetwork()&&isFarmer()){setTimeout(async()=>{const balance=await usdc.balanceOf(account);const payout=ethers.parseUnits($("payout")?.value||"500",6);const premium=payout*1000n/10000n;if(balance>=premium){$("mintSkipNote").textContent="You already have enough mUSDC — Step 2 was skipped.";setWizardStep(3)}else setWizardStep(2)},1000)}}catch(error){showToast(`Could not connect: ${friendlyError(error)}`,"error")}}

async function refreshAll(){if(!account)return;try{const [balance,vaultBalance,reserved,count,oracle]=await Promise.all([usdc.balanceOf(account),usdc.balanceOf(INSURANCE_ADDRESS),insurance.reserved(),insurance.policyCount(),insurance.oracle()]);oracleAddress=oracle;const formatted=ethers.formatUnits(balance,6);$("farmerBalance").textContent=`${formatted} mUSDC`;$("vaultBalance").textContent=`${ethers.formatUnits(vaultBalance,6)} mUSDC`;$("reservedAmount").textContent=`${ethers.formatUnits(reserved,6)} mUSDC`;$("policyCount").textContent=count.toString();$("homeVaultBalance").textContent=`${ethers.formatUnits(vaultBalance,6)} mUSDC`;$("homeReserved").textContent=`${ethers.formatUnits(reserved,6)} mUSDC`;$("homePolicyCount").textContent=count.toString();let paidOut=0n;for(let i=1n;i<=count;i++){const p=await insurance.policies(i);if(p[7])paidOut+=p[3]}$("homePaidOut").textContent=`${ethers.formatUnits(paidOut,6)} mUSDC`;const available=vaultBalance-reserved;if($("payout")&&$("wizardValidation")&&$("payout").value){const requested=ethers.parseUnits($("payout").value,6);$("wizardValidation").textContent=requested>available?`Payout exceeds the pool's available amount (${ethers.formatUnits(available,6)} mUSDC).` : $("wizardValidation").textContent}updateRole();await renderPolicies(count)}catch(error){showToast(`Could not refresh: ${friendlyError(error)}`,"error")}}

function updateRole(){const roleAddress=(account||"").toLowerCase();let role="Guest";if(roleAddress===DEMO_ACCOUNTS.owner)role="Owner";else if(roleAddress===DEMO_ACCOUNTS.farmer)role="Farmer";else if(roleAddress===DEMO_ACCOUNTS.oracle)role="Oracle";$("heroRole").textContent=`${role} · ${shortAddress(account)}`;if($("demoModeBadge"))$("demoModeBadge").hidden=!demoMode;if($("demoModeStatus"))$("demoModeStatus").textContent=demoMode?"Demo mode: local test keys":"Demo mode is OFF · MetaMask";const isOwner=roleAddress===DEMO_ACCOUNTS.owner;const isOracle=roleAddress===DEMO_ACCOUNTS.oracle;$("fundLocked").style.display=isOwner?"none":"flex";$("fundContent").classList.toggle("locked",!isOwner);$("weatherLocked").style.display=isOracle?"none":"flex";$("weatherContent").classList.toggle("locked",!isOracle);if(isOracle)$("oracleStatus").textContent=`Oracle account connected: ${shortAddress(account)} — weather reporting is enabled.`;else $("oracleStatus").textContent=`Not the oracle account. Switch to ${shortAddress(oracleAddress||DEMO_ACCOUNTS.oracle)}`;$("buyLock").textContent=isFarmer()?"Farmer wallet connected. You can continue.":`Connected as ${role}. Account #2 is recommended for buying cover.`}

function isFarmer(){return (account||"").toLowerCase()===DEMO_ACCOUNTS.farmer}

async function renderPolicies(count){const dropdown=$("weatherPolicyId");const cards=$("policyCards");dropdown.innerHTML='<option value="">Select active policy</option>';if(!count||count===0n){cards.innerHTML='<div class="empty-card">No policies created yet.</div>';return}const now=BigInt(Math.floor(Date.now()/1000));const items=[];for(let i=1n;i<=count;i++){const p=await insurance.policies(i);let status="Active",statusClass="active";if(p[7]){status="Paid Out";statusClass="paid"}else if(p[6]){status="Closed - No Payout";statusClass="closed"}else if(now>=p[5]){status="Expired";statusClass="expired"}if(statusClass==="active")dropdown.insertAdjacentHTML("beforeend",`<option value="${i}">Policy #${i} · ${escapeHtml(p[1])}</option>`);items.unshift(`<article class="policy-card" id="policy-card-${i}"><div class="policy-card-top"><small>POLICY #${i}</small><span class="status-badge ${statusClass}">${status}</span></div><h3>${escapeHtml(p[1])}</h3><div class="policy-data"><div><span>Threshold</span><strong>${p[2]} mm</strong></div><div><span>Payout</span><strong>${ethers.formatUnits(p[3],6)} mUSDC</strong></div><div><span>Premium</span><strong>${ethers.formatUnits(p[4],6)} mUSDC</strong></div><div><span>Holder</span><strong>${shortAddress(p[0])}</strong></div></div></article>`)}cards.innerHTML=items.join("")}

function updatePremium(){const value=$("payout")?.value;const threshold=$("rainfall")?.value||"—";const duration=Number($("duration")?.value||30);if(!value){$("premiumPreview").textContent="— mUSDC";return}try{const payout=ethers.parseUnits(value,6);const premium=payout*1000n/10000n;$("premiumPreview").textContent=`${ethers.formatUnits(premium,6)} mUSDC`;$("payoutPreview").textContent=`${ethers.formatUnits(payout,6)} mUSDC`;const end=new Date();end.setDate(end.getDate()+duration);$("coverEnd").textContent=end.toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"});$("wizardValidation").textContent="";if(!Number(threshold)||Number(threshold)<=0)$("wizardValidation").textContent="Enter a rainfall threshold above 0 mm.";if(Number(duration)<=0)$("wizardValidation").textContent="Cover duration must be at least 1 day.";}catch(_){$("premiumPreview").textContent="Invalid amount"}}

async function switchToHardhat(){if(!window.ethereum){showToast("MetaMask is not installed.","error");return}try{await window.ethereum.request({method:"wallet_switchEthereumChain",params:[{chainId:HARDHAT_CHAIN_ID}]});showToast("Hardhat network selected.","success")}catch(error){if(error.code===4902){try{await window.ethereum.request({method:"wallet_addEthereumChain",params:[HARDHAT_CONFIG]});showToast("Hardhat network added.","success") }catch(addError){showToast(`Could not add network: ${friendlyError(addError)}`,"error")}}else showToast(`Could not switch network: ${friendlyError(error)}`,"error")}}

function addTimeline(title,detail,type="info"){const timeline=$("activityTimeline");if(!timeline)return;const item=document.createElement("div");item.className="activity-item";item.innerHTML=`<strong>${escapeHtml(title)}</strong><br><span>${escapeHtml(detail)}</span>`;timeline.prepend(item)}
function installEventListeners(){if(listenersInstalled)return;listenersInstalled=true;insurance.on("PolicyCreated",async(id)=>{showToast(`Policy #${id} created.`,"success");addTimeline(`Policy #${id} created`,"createPolicy confirmed","info");await refreshAll()});insurance.on("WeatherReported",async(id,rain)=>{showToast(`Weather reported for policy #${id}: ${rain} mm`,"info");addTimeline(`Weather reported · Policy #${id}`,`${rain} mm rainfall`);await refreshAll()});insurance.on("PayoutExecuted",async(id,holder,payout)=>{showToast(`Payout successful: ${ethers.formatUnits(payout,6)} mUSDC for policy #${id}`,"success");addTimeline(`Payout executed · Policy #${id}`,`${ethers.formatUnits(payout,6)} mUSDC sent`);const card=$(`policy-card-${id}`);if(card){card.classList.add("highlight-policy");setTimeout(()=>card.classList.remove("highlight-policy"),2200)}await refreshAll()})}

async function handleMint(){wizardGoingBack=false;if(!account)return showToast("Connect MetaMask first.","error");const tx=await withTransaction($("mintButton"),"Minting…",async()=>usdc.mint(account,ethers.parseUnits("1000",6)));if(tx&&!wizardGoingBack){setTimeout(()=>setWizardStep(3),800)}}
async function handleFund(event){event.preventDefault();if(!account)return showToast("Connect MetaMask first.","error");const button=$("fundButton");const amount=ethers.parseUnits($("fundAmount").value,6);await withTransaction(button,"Approving…",async()=>{const approval=await usdc.approve(INSURANCE_ADDRESS,amount);await approval.wait();setLoading(button,true,"Funding…");return insurance.fundPool(amount)})}
function reviewPolicy(){if(!isFarmer())return showToast("Use the farmer account #2 before buying a policy.","error");const location=$("location").value.trim();const threshold=$("rainfall").value;const payout=ethers.parseUnits($("payout").value,6);const duration=$("duration").value;const premium=payout*1000n/10000n;const available=BigInt($("availablePoolUnits")?.dataset.value||0);if($("wizardValidation").textContent){return}$("policyReview").innerHTML=`<div><small>LOCATION</small><strong>${escapeHtml(location)}</strong></div><div><small>THRESHOLD</small><strong>${threshold} mm</strong></div><div><small>PAYOUT</small><strong>${ethers.formatUnits(payout,6)} mUSDC</strong></div><div><small>DURATION</small><strong>${duration} days</strong></div><div><small>PREMIUM</small><strong>${ethers.formatUnits(premium,6)} mUSDC</strong></div>`;setWizardStep(4)}
async function handleBuyPolicy(){wizardGoingBack=false;if(!account)return showToast("Connect MetaMask first.","error");const button=$("policyButton");const payout=ethers.parseUnits($("payout").value,6);const premium=payout*1000n/10000n;const approveRow=$("approveProgress"),createRow=$("createProgress");approveRow.innerHTML="<span>◌</span><strong>Approve premium</strong><small>Submitting…</small>";const tx=await withTransaction(button,"Approving premium…",async()=>{const approval=await usdc.approve(INSURANCE_ADDRESS,premium);await approval.wait();approveRow.innerHTML="<span>✓</span><strong>Approve premium</strong><small>Complete</small>";createRow.innerHTML="<span>◌</span><strong>Create policy</strong><small>Submitting…</small>";setLoading(button,true,"Creating policy…");return insurance.createPolicy($("location").value.trim(),BigInt($("rainfall").value),payout,BigInt($("duration").value))});if(tx&&!wizardGoingBack){await tx.wait();createRow.innerHTML="<span>✓</span><strong>Create policy</strong><small>Complete</small>";setTimeout(()=>{const count=$("policyCount")?.textContent||"—";$("successDetails").innerHTML=`<div><small>LOCATION</small><strong>${escapeHtml($("location").value)}</strong></div><div><small>PAYOUT</small><strong>${ethers.formatUnits(payout,6)} mUSDC</strong></div><div><small>STATUS</small><strong>Active</strong></div>`;setWizardStep(5)},800)}}
async function handleWeather(event){event.preventDefault();if(!account)return showToast("Connect MetaMask first.","error");if((account||"").toLowerCase()!==oracleAddress?.toLowerCase())return showToast("This wallet is not the oracle. Switch to account #1.","error");const id=BigInt($("weatherPolicyId").value);const rainfall=BigInt($("actualRainfall").value);const button=$("weatherButton");await withTransaction(button,"Reporting…",async()=>{const policy=await insurance.policies(id);payoutSnapshots.set(id.toString(),await usdc.balanceOf(policy[0]));return insurance.fulfillWeatherData(id,rainfall)})}

function setWizardStep(step){document.querySelectorAll(".wizard-panel").forEach(panel=>panel.classList.toggle("active",Number(panel.dataset.panel)===step));document.querySelectorAll(".wizard-step").forEach(button=>{const value=Number(button.dataset.step);button.classList.toggle("active",value===step);button.classList.toggle("done",value<step)})}

window.addEventListener("load",()=>{document.querySelectorAll("[data-view]").forEach(button=>button.addEventListener("click",()=>showView(button.dataset.view)));$("menuToggle").addEventListener("click",()=>$("navLinks").classList.toggle("open"));$("connectButton").addEventListener("click",connectWallet);$("switchAccountButton").addEventListener("click",switchMetaMaskAccount);$("mintButton").addEventListener("click",handleMint);$("fundForm").addEventListener("submit",handleFund);$("policyForm").addEventListener("submit",e=>e.preventDefault());$("reviewPolicyButton").addEventListener("click",reviewPolicy);$("policyButton").addEventListener("click",handleBuyPolicy);$("weatherForm").addEventListener("submit",handleWeather);$("refreshButton").addEventListener("click",refreshAll);$("payout").addEventListener("input",updatePremium);document.querySelectorAll(".wizard-step").forEach(button=>button.addEventListener("click",()=>setWizardStep(Number(button.dataset.step))));$("demoToggle").addEventListener("click",()=>setDemoMode($("demoToggle").getAttribute("aria-pressed")!=="true"));$("demoRoleSelect").addEventListener("change",event=>switchDemoRole(event.target.value));if(window.ethereum){window.ethereum.on("accountsChanged",accounts=>{if(demoMode)return;if(accounts&&accounts.length){provider=new ethers.BrowserProvider(window.ethereum);provider.getSigner().then(async selectedSigner=>{signer=selectedSigner;account=await signer.getAddress();await setActiveSignerContract();$("connectButton").textContent="Wallet connected"})}else{account=null;provider=signer=usdc=insurance=null;$("heroRole").textContent="Connect wallet"}});window.ethereum.on("chainChanged",async()=>{if(demoMode){const chainId=await getConnectedChainId();if(chainId!==31337){demoMode=false;$("demoToggle").setAttribute("aria-pressed","false");$("demoRoleSelect").disabled=true;$("switchAccountButton").disabled=false;$("demoModeBadge").hidden=true;$("demoModeStatus").textContent="Demo mode unavailable: connect to chain 31337.";showToast("Demo mode disabled because the chain is no longer 31337.","error")}else await refreshAll()}else if(await updateNetwork()){await connectWallet()}else await refreshAll()})}updatePremium();if(window.ethereum)updateNetwork();getConnectedChainId().then(chainId=>{const allowed=chainId===31337;$("demoToggle").disabled=!allowed;if(!allowed){$("demoToggle").setAttribute("aria-pressed","false");$("demoRoleSelect").disabled=true;$("demoModeStatus").textContent="Demo mode unavailable: connect to chain 31337."}});

if(window.ethereum&&!wizardInitialized){wizardInitialized=true;window.ethereum.request({method:"eth_accounts"}).then(async(accounts)=>{if(accounts&&accounts.length){account=accounts[0];provider=new ethers.BrowserProvider(window.ethereum);signer=await provider.getSigner();account=await signer.getAddress();usdc=new ethers.Contract(USDC_ADDRESS,USDC_ABI,signer);insurance=new ethers.Contract(INSURANCE_ADDRESS,INSURANCE_ABI,signer);oracleAddress=await insurance.oracle();installEventListeners();await refreshAll();if(await updateNetwork()&&isFarmer()){setTimeout(async()=>{const balance=await usdc.balanceOf(account);const payout=ethers.parseUnits($("payout")?.value||"500",6);const premium=payout*1000n/10000n;if(balance>=premium){$("mintSkipNote").textContent="You already have enough mUSDC";setWizardStep(3)}else setWizardStep(2)},300)}}}).catch(()=>{})}

window.setTimeout(()=>{const back=$("wizardBack");if(back)back.addEventListener("click",()=>{wizardGoingBack=true;const active=document.querySelector(".wizard-panel.active");if(active){const current=Number(active.dataset.panel);if(current>1)setWizardStep(current-1)}});$("buyAnother")?.addEventListener("click",()=>{wizardGoingBack=false;setWizardStep(3)});$("networkButton")?.addEventListener("click",switchToHardhat);document.querySelectorAll(".presets button").forEach(button=>button.addEventListener("click",()=>{const preset=button.dataset.preset;const values={starter:["Mandya, Karnataka",50,300,30],standard:["Mandya, Karnataka",50,500,30],extended:["Nashik, Maharashtra",40,800,60]}[preset];$("location").value=values[0];$("rainfall").value=values[1];$("payout").value=values[2];$("duration").value=values[3];document.querySelectorAll(".presets button").forEach(b=>b.classList.toggle("active",b===button));updatePremium();if(refreshAll)refreshAll()}));
for(const id of ["rainfall","payout","duration"]){$(id)?.addEventListener("input",updatePremium)}
const helpHidden=()=>{const onHelp=document.querySelector("#help.active");$("chatbot").style.display=onHelp?"none":"block"};document.querySelectorAll("[data-view]").forEach(button=>button.addEventListener("click",()=>setTimeout(helpHidden,20)));helpHidden();},100);
});
