import * as anchor from '@coral-xyz/anchor';
import { Connection, PublicKey, Transaction, TransactionInstruction, SystemProgram, Keypair } from '@solana/web3.js';
import { Buffer } from 'buffer';

window.Buffer = Buffer;

const PROGRAM_ID = 'YzJtguRigAkcpxN5rRpWWiJiQkBXKXNZEu5zWQVJqK4';
const RPC_URL = 'https://api.devnet.solana.com';

let wallet = null;
let connection = null;
let options = ['Option 1', 'Option 2'];
document.addEventListener('DOMContentLoaded', () => {
    connection = new Connection(RPC_URL, 'confirmed');
    setupEventListeners();
    renderOptions();
});

async function connectWallet() {
    try {
        if (!window.solana) {
            alert('Please install Phantom wallet!');
            return;
        }
        
        const resp = await window.solana.connect();
        wallet = window.solana;
        
        document.getElementById('not-connected').style.display = 'none';
        document.getElementById('connected-content').style.display = 'block';
        document.getElementById('connect-wallet').style.display = 'none';
        document.getElementById('wallet-info').style.display = 'flex';
        document.getElementById('wallet-address').textContent = shortAddress(resp.publicKey.toString());
        
        loadProposals();
    } catch (err) {
        console.error('Wallet connection failed:', err);
        alert('Failed to connect wallet');
    }
}

async function disconnectWallet() {
    if (wallet) {
        await wallet.disconnect();
        wallet = null;
    }
    
    document.getElementById('not-connected').style.display = 'block';
    document.getElementById('connected-content').style.display = 'none';
    document.getElementById('connect-wallet').style.display = 'block';
    document.getElementById('wallet-info').style.display = 'none';
}

function renderOptions() {
    const container = document.getElementById('options-container');
    container.innerHTML = '';
    
    options.forEach((opt, idx) => {
        const row = document.createElement('div');
        row.className = 'option-row';
        
        const input = document.createElement('input');
        input.type = 'text';
        input.value = opt;
        input.placeholder = `Option ${idx + 1} (max 50 chars)`;
        input.maxLength = 50;
        input.addEventListener('input', (e) => {
            options[idx] = e.target.value;
        });
        
        row.appendChild(input);
        
        if (options.length > 2) {
            const removeBtn = document.createElement('button');
            removeBtn.className = 'btn-danger';
            removeBtn.textContent = '✕';
            removeBtn.addEventListener('click', () => {
                options.splice(idx, 1);
                renderOptions();
            });
            row.appendChild(removeBtn);
        }
        
        container.appendChild(row);
    });
}

function addOption() {
    if (options.length < 10) {
        options.push(`Option ${options.length + 1}`);
        renderOptions();
    }
}

async function createProposal() {
    if (!wallet) {
        alert('Please connect your wallet');
        return;
    }
    
    const description = document.getElementById('description').value.trim();
    const duration = parseInt(document.getElementById('duration').value);
    
    if (!description) {
        alert('Please enter a description');
        return;
    }
    
    if (options.length < 2) {
        alert('Please add at least 2 options');
        return;
    }
    
    if (options.some(opt => !opt.trim())) {
        alert('All options must be filled');
        return;
    }
    
    if (duration <= 0) {
        alert('Duration must be greater than 0');
        return;
    }
    
    const btn = document.getElementById('create-proposal');
    btn.disabled = true;
    btn.textContent = '⏳ Creating...';
    
    try {
        const proposalKeypair = Keypair.generate();
        
        const data = encodeCreateProposal(description, options, duration);
        
        const instruction = new TransactionInstruction({
            keys: [
                { pubkey: proposalKeypair.publicKey, isSigner: true, isWritable: true },
                { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            ],
            programId: new PublicKey(PROGRAM_ID),
            data: data,
        });
        
        const transaction = new Transaction().add(instruction);
        transaction.feePayer = wallet.publicKey;
        transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        
        transaction.partialSign(proposalKeypair);
        const signed = await wallet.signTransaction(transaction);
        const signature = await connection.sendRawTransaction(signed.serialize());
        await connection.confirmTransaction(signature);
        
        alert('✅ Proposal created successfully!');
        document.getElementById('description').value = '';
        options = ['Option 1', 'Option 2'];
        renderOptions();
        
        loadProposals();
    } catch (err) {
        console.error('Create proposal failed:', err);
        alert('Failed to create proposal: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = '🚀 Create Proposal';
    }
}

async function loadProposals() {
    const loading = document.getElementById('loading');
    const noProposals = document.getElementById('no-proposals');
    const list = document.getElementById('proposals-list');
    
    loading.style.display = 'block';
    noProposals.style.display = 'none';
    list.innerHTML = '';
    
    try {
        const programId = new PublicKey(PROGRAM_ID);
        const accounts = await connection.getProgramAccounts(programId);
        
        const proposals = accounts
            .map(({ pubkey, account }) => {
                try {
                    const data = decodeProposal(account.data);
                    return { pubkey, ...data };
                } catch (err) {
                    return null;
                }
            })
            .filter(p => p !== null && p.options && p.options.length > 0);
        
        loading.style.display = 'none';
        
        if (proposals.length === 0) {
            noProposals.style.display = 'block';
        } else {
            proposals.forEach(proposal => {
                list.appendChild(createProposalCard(proposal));
            });
        }
    } catch (err) {
        console.error('Load proposals failed:', err);
        loading.style.display = 'none';
        alert('Failed to load proposals');
    }
}

function createProposalCard(proposal) {
    const card = document.createElement('div');
    card.className = 'proposal-card';
    
    const now = Math.floor(Date.now() / 1000);
    const endTime = proposal.endTs;
    const votingEnded = now >= endTime;
    const showResults = votingEnded || !proposal.isActive;
    
    const totalVotes = proposal.voteCounts.reduce((sum, count) => sum + count, 0);
    const winningIndex = proposal.voteCounts.reduce((maxIdx, count, idx, arr) => 
        count > arr[maxIdx] ? idx : maxIdx, 0
    );
    
    const isCreator = wallet && wallet.publicKey && 
                      proposal.creator.toString() === wallet.publicKey.toString();
    const canClose = isCreator && votingEnded && proposal.isActive;
    
    card.innerHTML = `
        <div class="proposal-header">
            <h4>${escapeHtml(proposal.description)}</h4>
            <code class="proposal-id">${shortAddress(proposal.pubkey.toString())}</code>
        </div>
        
        <div class="proposal-meta">
            <span>👤 ${shortAddress(proposal.creator.toString())}</span>
            <span>•</span>
            <span>${votingEnded ? (proposal.isActive ? '🟡 Ended (Not Closed)' : '⚫ Closed') : '🟢 Active'}</span>
            <span>•</span>
            <span>⏰ ${votingEnded ? 'Ended: ' : 'Ends: '}${new Date(endTime * 1000).toLocaleString()}</span>
            <span>•</span>
            <span>🗳️ ${totalVotes} votes</span>
        </div>
        
        <div class="results-section">
            <div class="results-header">
                Results
                ${!showResults ? '<span class="hidden-badge">🔒 Hidden until voting ends</span>' : ''}
            </div>
            
            ${showResults ? renderResults(proposal, totalVotes, winningIndex) : renderHiddenResults(proposal)}
        </div>
        
        <div class="vote-buttons">
            ${proposal.options.map((option, idx) => `
                <button onclick="vote('${proposal.pubkey.toString()}', ${idx})" ${!proposal.isActive || votingEnded ? 'disabled' : ''}>
                    Vote: ${escapeHtml(option)}
                </button>
            `).join('')}
            ${canClose ? `
                <button class="btn-danger" onclick="closeProposal('${proposal.pubkey.toString()}')">
                    🔒 Close Proposal
                </button>
            ` : ''}
        </div>
    `;
    
    return card;
}

function renderResults(proposal, totalVotes, winningIndex) {
    return proposal.options.map((option, idx) => {
        const votes = proposal.voteCounts[idx];
        const percentage = totalVotes > 0 ? ((votes / totalVotes) * 100).toFixed(1) : '0';
        const isWinning = totalVotes > 0 && idx === winningIndex;
        
        return `
            <div class="option-result">
                <div class="option-info">
                    <span class="option-name ${isWinning ? 'winning' : ''}">
                        ${isWinning ? '🏆 ' : ''}${escapeHtml(option)}
                    </span>
                    <span class="option-votes">${votes} votes (${percentage}%)</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill ${isWinning ? 'winning' : ''}" style="width: ${percentage}%"></div>
                </div>
            </div>
        `;
    }).join('');
}

function renderHiddenResults(proposal) {
    return `
        <div class="hidden-results">
            ${proposal.options.map(option => `
                <div class="option-result">
                    <div class="option-info">
                        <span class="option-name">${escapeHtml(option)}</span>
                        <span class="option-votes">??? votes (??%)</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: 50%"></div>
                    </div>
                </div>
            `).join('')}
            <div class="hidden-overlay">
                <div class="icon">🔒</div>
                <div class="title">Results Hidden</div>
                <div class="subtitle">Revealed after voting ends</div>
            </div>
        </div>
    `;
}

// Close proposal function
window.closeProposal = async function(proposalPubkey) {
    if (!wallet) {
        alert('Please connect your wallet');
        return;
    }
    
    if (!confirm('Are you sure you want to close this proposal?')) {
        return;
    }
    
    try {
        const proposalKey = new PublicKey(proposalPubkey);
        
        const discriminator = Buffer.from([213, 178, 139, 19, 50, 191, 82, 245]);
        
        const instruction = new TransactionInstruction({
            keys: [
                { pubkey: proposalKey, isSigner: false, isWritable: true },
                { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
            ],
            programId: new PublicKey(PROGRAM_ID),
            data: discriminator,
        });
        
        const transaction = new Transaction().add(instruction);
        transaction.feePayer = wallet.publicKey;
        transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        
        const signed = await wallet.signTransaction(transaction);
        const signature = await connection.sendRawTransaction(signed.serialize());
        await connection.confirmTransaction(signature);
        
        alert('✅ Proposal closed successfully!');
        loadProposals();
    } catch (err) {
        console.error('Close proposal failed:', err);
        alert('Failed to close proposal: ' + err.message);
    }
};

window.vote = async function(proposalPubkey, optionIndex) {
    if (!wallet) {
        alert('Please connect your wallet');
        return;
    }
    
    try {
        const proposalKey = new PublicKey(proposalPubkey);
        const votePda = await deriveVotePda(proposalKey, wallet.publicKey);
        
        const data = encodeVote(optionIndex);
        
        const instruction = new TransactionInstruction({
            keys: [
                { pubkey: proposalKey, isSigner: false, isWritable: true },
                { pubkey: votePda, isSigner: false, isWritable: true },
                { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            ],
            programId: new PublicKey(PROGRAM_ID),
            data: data,
        });
        
        const transaction = new Transaction().add(instruction);
        transaction.feePayer = wallet.publicKey;
        transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        
        const signed = await wallet.signTransaction(transaction);
        const signature = await connection.sendRawTransaction(signed.serialize());
        await connection.confirmTransaction(signature);
        
        alert('✅ Vote cast successfully!');
        loadProposals();
    } catch (err) {
        console.error('Vote failed:', err);
        if (err.message.includes('already in use')) {
            alert('You have already voted on this proposal');
        } else {
            alert('Failed to vote: ' + err.message);
        }
    }
};

function encodeCreateProposal(description, options, durationSec) {
    const discriminator = Buffer.from([132, 116, 68, 174, 216, 160, 198, 22]);
    const descBuffer = encodeString(description);
    const optsBuffer = encodeVecString(options);
    const durBuffer = encodeI64(durationSec);
    
    return Buffer.concat([discriminator, descBuffer, optsBuffer, durBuffer]);
}

function encodeVote(optionIndex) {
    const discriminator = Buffer.from([227, 110, 155, 23, 136, 126, 172, 25]);
    const indexBuffer = Buffer.from([optionIndex]);
    
    return Buffer.concat([discriminator, indexBuffer]);
}

function encodeString(str) {
    const bytes = new TextEncoder().encode(str);
    const len = Buffer.alloc(4);
    len.writeUInt32LE(bytes.length, 0);
    return Buffer.concat([len, Buffer.from(bytes)]);
}

function encodeVecString(arr) {
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32LE(arr.length, 0);
    const encoded = arr.map(s => encodeString(s));
    return Buffer.concat([lenBuf, ...encoded]);
}

function encodeI64(n) {
    const buf = Buffer.alloc(8);
    buf.writeBigInt64LE(BigInt(n));
    return buf;
}

function decodeProposal(data) {
    let offset = 8;
    
    const creator = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;
    
   
    const descLen = data.readUInt32LE(offset);
    offset += 4;
    const description = new TextDecoder().decode(data.slice(offset, offset + descLen));
    offset += descLen;
    
    const optionsLen = data.readUInt32LE(offset);
    offset += 4;
    const options = [];
    for (let i = 0; i < optionsLen; i++) {
        const strLen = data.readUInt32LE(offset);
        offset += 4;
        const str = new TextDecoder().decode(data.slice(offset, offset + strLen));
        offset += strLen;
        options.push(str);
    }
    
    const countsLen = data.readUInt32LE(offset);
    offset += 4;
    const voteCounts = [];
    for (let i = 0; i < countsLen; i++) {
        const count = Number(data.readBigUInt64LE(offset));
        offset += 8;
        voteCounts.push(count);
    }
    
    const isActive = data[offset] === 1;
    offset += 1;
    
    const startTs = Number(data.readBigInt64LE(offset));
    offset += 8;
    
    const endTs = Number(data.readBigInt64LE(offset));
    
    return { creator, description, options, voteCounts, isActive, startTs, endTs };
}

async function deriveVotePda(proposalPubkey, voterPubkey) {
    const [pda] = await PublicKey.findProgramAddress(
        [
            Buffer.from('vote'),
            proposalPubkey.toBuffer(),
            voterPubkey.toBuffer(),
        ],
        new PublicKey(PROGRAM_ID)
    );
    return pda;
}

function shortAddress(address) {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function setupEventListeners() {
    document.getElementById('connect-wallet').addEventListener('click', connectWallet);
    document.getElementById('disconnect-wallet').addEventListener('click', disconnectWallet);
    document.getElementById('add-option').addEventListener('click', addOption);
    document.getElementById('create-proposal').addEventListener('click', createProposal);
}
