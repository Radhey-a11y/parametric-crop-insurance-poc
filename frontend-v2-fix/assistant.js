// Offline help: keywords match complete Verdant guidance; no API or keys are used.
const guide = {
  "parametric": "Parametric insurance pays from an objective data trigger instead of a long claim assessment. In Verdant, the trigger is rainfall: if actual rainfall is below the policy threshold, the contract sends the agreed payout. The policy terms are fixed before it begins, so settlement is fast and auditable.",
  "how": "The end-to-end flow has four actors and steps. The Owner funds the pool with test mUSDC. The Farmer approves the premium and calls createPolicy. The Oracle calls fulfillWeatherData with rainfall for that policy. The smart contract compares the reading with the threshold and settles automatically.\n\n• Below threshold: payout is sent.\n• At or above threshold: no payout.\n• Expiry: a policy can be closed through expirePolicy.",
  "buy": "To buy a policy, connect MetaMask as account #2. Mint test mUSDC if needed, then enter location, rainfall threshold, payout and duration. Review the 10% premium, approve it, and call createPolicy. The wizard moves to Success after the transaction is confirmed.",
  "premium": "The premium is exactly 10% of the payout. It is calculated on-chain as payout × 1000 / 10000. For example, a 500 mUSDC payout requires a 50 mUSDC premium. The same premium is approved in the ERC20 token before createPolicy is called.",
  "threshold": "The rainfall threshold is the drought level agreed in the policy. A rainfall of 20 mm with a threshold of 50 mm is below the trigger and qualifies for payout. An 80 mm reading is at or above the threshold and does not qualify.",
  "payout": "When rainfall is below threshold, fulfillWeatherData marks the policy settled and transfers the payout to the policy holder. In the demo, switch to account #1, enter the policy ID and the rainfall reading, then submit.\n\n• The payout is automatic.\n• The contract emits PayoutExecuted.\n• The table changes to Paid Out.",
  "above": "If rainfall is equal to or above the threshold, the policy is settled but no payout is transferred. The policy status should show Closed - No Payout. This is the intended parametric outcome rather than a failed weather report.",
  "expiry": "A policy has an expiry timestamp based on its duration in days. Before expiry, the Oracle may still submit rainfall. After expiry, expirePolicy can release reserved liability and mark the policy settled. It cannot be settled twice.",
  "oracle": "The oracle is the account authorized to submit weather data. In this prototype, account #1 is the trusted oracle. In production, the oracle problem is solved by decentralized oracle networks, trusted data sources, reputation, aggregation and dispute controls. One account is used here only for a clear demonstration.",
  "musdc": "mUSDC is a six-decimal mock ERC20 token used only on Hardhat. It has the same base-unit pattern as USDC, so 500 mUSDC is 500,000,000 base units on-chain. It has no real monetary value.",
  "safe": "Test mUSDC is safe to use only on the Hardhat Local network. Do not send real assets to demo addresses or reuse demo private keys outside local development. For this prototype, MetaMask and the smart contract rules contain no real money.",
  "pool": "The pool balance is the mUSDC held by the insurance contract. Reserved is the amount promised to active policies. Available cover is pool balance minus reserved. If a payout would exceed available cover, policy creation can fail with Pool too small.",
  "blockchain": "Blockchain provides a shared, auditable source for policy terms and settlement events. The contract is also transparent and can transfer funds automatically. A traditional database could store the same fields, but it would rely on a centralized administrator to execute and prove settlement.",
  "roles": "There are three demo roles. Owner/account #0 funds the pool. Farmer/account #2 mints test mUSDC and buys policies. Oracle/account #1 submits rainfall. The app detects these addresses and applies friendly role-aware locked pages.",
  "metamask": "Add MetaMask network Hardhat Local with RPC http://127.0.0.1:8545, chain ID 31337, and currency symbol ETH. Import the public test accounts from demo-accounts.txt. Never enter real seed phrases or private keys.",
  "errors": "Common fixes: Not oracle means switch to account #1. Wrong network means switch to 31337 or use the dApp network button. Nounce/nonces usually need a MetaMask reset or waiting for pending confirmations. After node restart, clear MetaMask activity data and redeploy or use the existing reset addresses only after redeployment. Not enough mUSDC means mint test mUSDC. Pool too small means fund or change the payout.",
  "regulation": "India's insurance and product regulations may involve IRDAI, including regulatory sandboxes and distribution rules. This information is general educational content, not legal or insurance advice. Production use would require licensed participants and formal legal review.",
  "roadmap": "A production roadmap would add decentralized weather oracles, licensed underwriting, insurer custody, compliance KYC/AML, audited contracts, monitoring, governance, dispute processes and insurance-regulatory approval. A public live launch should not reuse demo private keys or test funds.",
  "limitations": "This prototype has one oracle account, fixed mock mUSDC, no real insurance license and local-only settlement. It does not cover legal underwriting, portfolio risk modelling, oracle disputes or production-grade key management. It is designed for a clear technical demonstration.",
  "demo": "Demo script: 1) Start Hardhat node. 2) Open http://localhost:3001. 3) Add chain 31337. 4) Connect account #0 and fund. 5) Connect account #2 and mint 1000 mUSDC. 6) Buy Mandya cover at 50 mm with 500 mUSDC payout. 7) Switch to account #1 and report 20 mm. 8) Confirm Paid Out and the farmer balance increase.",
  "contact": "The project lead is Abhishek Pandey (Radhey). Institution: CHRIST (Deemed to be University), Bengaluru. The demo team member fields and email are placeholders to replace with the final viva team details."
};

const categories = {
  "Basics": [["parametric","What is parametric insurance?"],["how","How does it work end to end?"],["buy","How do I buy a policy?"]],
  "Policy terms": [["premium","Premium calculation"],["threshold","What does threshold mean?"],["payout","When will I get paid?"],["above","Rain at or above threshold"],["expiry","What happens at expiry?"]],
  "Technology": [["oracle","What is the oracle?"],["musdc","What is mUSDC?"],["pool","Pool vs reserved amount"],["blockchain","Why blockchain?"],["roles","Owner, Farmer and Oracle roles"]],
  "Demo setup": [["metamask","MetaMask setup"],["errors","Fix common errors"],["safe","Is the money safe?"],["demo","Walk through the demo"]],
  "Context": [["regulation","India and IRDAI"],["roadmap","Production roadmap"],["limitations","Prototype limitations"],["contact","Contact the team"]]
};

function findAnswer(query){
  const q=(query||"").toLowerCase();
  if(q.includes("pool balance")||q.includes("current pool")||q.includes("vault balance")){
    const amount=document.getElementById("homeVaultBalance")?.textContent||document.getElementById("vaultBalance")?.textContent||"unknown";
    return `The current pool balance in this demo is ${amount}. This is the mUSDC held by the insurance contract. The reserved amount and available capacity may change after funding or policy settlement.`;
  }
  if(q.includes("connected")||q.includes("which account")||q.includes("my role")){
    const role=document.querySelector("#heroRole")?.textContent||"No account connected";
    return `The app currently reports: ${role}. Owner is account #0, Farmer is account #2, and Oracle is account #1. If MetaMask is on another address, this app shows a Demo wallet or Guest role.`;
  }
  for(const [key,text] of Object.entries(guide)){
    if(q.includes(key)||q.includes(key=== "payout"?"paid":"<never>"))return text;
  }
  if(q.includes("premium")||q.includes("cost"))return guide.premium;
  if(q.includes("threshold")||q.includes("rainfall")||q.includes("drought"))return guide.threshold;
  if(q.includes("error")||q.includes("failed")||q.includes("nonce")||q.includes("restart"))return guide.errors;
  if(q.includes("oracle")||q.includes("weather"))return guide.oracle;
  if(q.includes("pool")||q.includes("reserved")||q.includes("fund"))return guide.pool;
  return "I’m not sure about that exact phrase. Verdant can help with premium terms, payouts, buying a policy, the oracle, pool/reserved amounts, Hardhat setup, common errors, regulation or the demo script. Choose a topic below, or phrase your question with one of those terms.";
}

function scrollChatToEnd(chat, bubble) {
  requestAnimationFrame(() => {
    chat.scrollTop = chat.scrollHeight;
    if (bubble) bubble.scrollIntoView({ block: "end" });
  });
}

function formatAssistantAnswer(container, text) {
  const paragraphs = text.split("\n\n");
  container.replaceChildren();
  paragraphs.forEach((paragraph) => {
    const lines = paragraph.split("\n").filter(Boolean);
    const bulletLines = lines.filter((line) => /^•\s/.test(line));
    const proseLines = lines.filter((line) => !/^•\s/.test(line));
    if (proseLines.length) {
      proseLines.forEach((line) => {
        const p = document.createElement("p");
        p.textContent = line;
        container.appendChild(p);
      });
    }
    if (bulletLines.length) {
      const list = document.createElement("ul");
      bulletLines.forEach((line) => {
        const li = document.createElement("li");
        li.textContent = line.replace(/^•\s*/, "");
        list.appendChild(li);
      });
      container.appendChild(list);
    }
  });
}

function addMessage(text,type="assistant",followups=[]){
  const chat=document.getElementById("chatMessages");
  if(!chat)return;
  const row=document.createElement("div");row.className=type==="user"?"user-row":"assistant-row";
  if(type==="assistant")row.innerHTML=`<div class="chat-avatar">V</div>`;
  const bubble=document.createElement("div");bubble.className=type==="user"?"user-bubble":"assistant-bubble";
  row.appendChild(bubble);chat.appendChild(row);scrollChatToEnd(chat,row);
  if(type==="assistant"){
    bubble.classList.add("typing");bubble.innerHTML="<i></i><i></i><i></i>";
    scrollChatToEnd(chat,bubble);
    setTimeout(()=>{
      bubble.classList.remove("typing");
      bubble.textContent="";
      let index=0;
      const timer=setInterval(()=>{
        const visible=text.slice(0,index);
        bubble.textContent=visible;
        if(index>text.length){
          clearInterval(timer);
          formatAssistantAnswer(bubble,text);
          renderFollowups(followups);
          scrollChatToEnd(chat,row);
        }else{
          if(index%20===0) scrollChatToEnd(chat,row);
        }
        index+=2;
      },10);
    },550);
  }else{
    bubble.textContent=text;
    scrollChatToEnd(chat,row);
  }
}

function renderFollowups(followups){const area=document.getElementById("followups");if(!area)return;const chips=followups.length?followups:[["buy","How do I buy a policy?"],["payout","How do payouts work?"],["metamask","Set up MetaMask"]];area.innerHTML=chips.map(([key,label])=>`<button data-answer="${key}">${label}</button>`).join("");area.querySelectorAll("button").forEach(button=>button.addEventListener("click",()=>sendChat(button.textContent)))}

function sendChat(text){if(!text.trim())return;addMessage(text,"user");const answer=findAnswer(text);addMessage(answer,"assistant",[["demo","Run the demo"],["errors","Fix an error"]])}

window.addEventListener("load",()=>{
  const sidebar=document.getElementById("suggestedQuestions");if(sidebar){sidebar.innerHTML=Object.entries(categories).map(([group,items])=>`<div class="question-group"><h3>${group}</h3>${items.map(([key,label])=>`<button data-key="${key}">${label}</button>`).join("")}</div>`).join("");sidebar.querySelectorAll("button").forEach(button=>button.addEventListener("click",()=>sendChat(button.textContent)))}
  const form=document.getElementById("chatForm");form?.addEventListener("submit",event=>{event.preventDefault();const input=document.getElementById("chatInput");sendChat(input.value);input.value=""});
  document.getElementById("newChat")?.addEventListener("click",()=>{const chat=document.getElementById("chatMessages");chat.innerHTML='<div class="assistant-row"><div class="chat-avatar">V</div><div class="assistant-bubble">New chat started. What would you like to understand?</div></div>';renderFollowups([["parametric","What is parametric insurance?"],["buy","How do I buy cover?"]])});
  renderFollowups([]);

  const launcher=document.getElementById("chatLauncher"),panel=document.getElementById("chatPanel");launcher?.addEventListener("click",()=>panel.hidden=!panel.hidden);document.getElementById("chatClose")?.addEventListener("click",()=>panel.hidden=true);document.querySelectorAll(".chat-chips button").forEach(button=>button.addEventListener("click",()=>{sendChat(button.textContent)}));
});
