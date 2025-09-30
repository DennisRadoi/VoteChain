import { useEffect, useState } from "react";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  SystemProgram,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Buffer } from "buffer";
import idl from "./idl/voting_dapp.json";
import { deriveVotePda } from "./pdas";

type ProposalAccount = {
  creator: PublicKey;
  description: string;
  options: string[];
  voteCounts: anchor.BN[];
  isActive: boolean;
  startTs: anchor.BN;
  endTs: anchor.BN;
};

type Props = {
  program: Program<any>;
  programId: PublicKey;
  pubkey: PublicKey;
  account: ProposalAccount;
  walletPubkey?: PublicKey;
  onChanged?: () => void;
};

// Ia discriminatorul de 8 bytes pentru o instrucțiune din IDL sau calculează fallback.
function getIxDiscriminator(ixName: string): Buffer {
  const ix = (idl as any)?.instructions?.find((i: any) => i.name === ixName);
  if (
    ix?.discriminator &&
    Array.isArray(ix.discriminator) &&
    ix.discriminator.length === 8
  ) {
    return Buffer.from(ix.discriminator);
  }
  const hex = anchor.utils.sha256.hash(`global:${ixName}`);
  return Buffer.from(hex, "hex").subarray(0, 8);
}
function encodeU8(n: number): Buffer {
  return Buffer.from([n]);
}

async function sendTxWithWallet(params: {
  connection: any;
  wallet: ReturnType<typeof useWallet>;
  tx: Transaction;
}) {
  const { connection, wallet, tx } = params;
  if (!wallet.connected || !wallet.publicKey)
    throw new Error("Wallet not connected");
  if (!wallet.signTransaction)
    throw new Error("Wallet cannot sign transactions");

  tx.feePayer = wallet.publicKey;
  const latest = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = latest.blockhash;

  const signed = await wallet.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
    maxRetries: 3,
  });
  await connection.confirmTransaction(
    { signature: sig, ...latest },
    "confirmed"
  );
  return sig;
}

export default function ProposalCard({
  program,
  programId,
  pubkey,
  account,
  walletPubkey,
  onChanged,
}: Props) {
  const { connection } = useConnection();
  const wallet = useWallet();

  // actualizează "acum" la fiecare secundă ca să se (de)activeze butoanele corect
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const end = account.endTs.toNumber();

  // Permite vot până la deadline INCLUSIV
  const canVote = account.isActive && now <= end;
  const isCreator = walletPubkey?.equals(account.creator) ?? false;
  const canClose = isCreator && now >= end && account.isActive;

  async function vote(optionIndex: number) {
    try {
      if (!wallet.connected || !wallet.publicKey) {
        alert("Conectează wallet-ul");
        return;
      }
      // PDA: ["vote", proposal, voter]
      const votePda = deriveVotePda(programId, pubkey, wallet.publicKey);

      // Data: discriminator("vote") + u8(option_index)
      const data = Buffer.concat([
        getIxDiscriminator("vote"),
        encodeU8(optionIndex),
      ]);

      // Ordinea conturilor conform IDL-ului pentru `vote`:
      // proposal (mut), vote (mut/init), voter (signer, mut), system_program
      const keys = [
        { pubkey, isWritable: true, isSigner: false },
        { pubkey: votePda, isWritable: true, isSigner: false },
        { pubkey: wallet.publicKey, isWritable: true, isSigner: true },
        { pubkey: SystemProgram.programId, isWritable: false, isSigner: false },
      ];

      const ix = new TransactionInstruction({
        programId: (program as any).programId as PublicKey,
        keys,
        data,
      });
      const tx = new Transaction().add(ix);

      const sig = await sendTxWithWallet({ connection, wallet, tx });
      console.log("vote tx:", sig);
      onChanged?.();
    } catch (e: any) {
      console.error(e);
      alert(parseAnchorError(e));
    }
  }

  async function close() {
    try {
      if (!wallet.connected || !wallet.publicKey) {
        alert("Conectează wallet-ul");
        return;
      }
      // Data: discriminator("close_proposal"), fără args
      const data = getIxDiscriminator("close_proposal");

      // Ordinea conturilor conform IDL-ului pentru `close_proposal`:
      // proposal (mut), creator (signer, mut)
      const keys = [
        { pubkey, isWritable: true, isSigner: false },
        { pubkey: wallet.publicKey, isWritable: true, isSigner: true },
      ];

      const ix = new TransactionInstruction({
        programId: (program as any).programId as PublicKey,
        keys,
        data,
      });
      const tx = new Transaction().add(ix);

      const sig = await sendTxWithWallet({ connection, wallet, tx });
      console.log("close_proposal tx:", sig);
      onChanged?.();
    } catch (e: any) {
      console.error(e);
      alert(parseAnchorError(e));
    }
  }

  const totalVotes = account.voteCounts.reduce((sum, count) => sum + count.toNumber(), 0);
  const winningIndex = account.voteCounts.reduce((maxIdx, count, idx, arr) => 
    count.toNumber() > arr[maxIdx].toNumber() ? idx : maxIdx, 0
  );

  return (
    <div
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-color)",
        padding: "1.5rem",
        borderRadius: "16px",
        marginTop: "1.5rem",
        boxShadow: "0 2px 16px rgba(0, 0, 0, 0.3)",
        transition: "transform 0.2s, box-shadow 0.2s"
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 4px 24px rgba(139, 92, 246, 0.2)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 2px 16px rgba(0, 0, 0, 0.3)";
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
        <h4 style={{ margin: 0, fontSize: "1.25rem", flex: 1 }}>{account.description}</h4>
        <code style={{ 
          fontSize: "0.75rem", 
          color: "var(--text-secondary)",
          background: "var(--bg-tertiary)",
          padding: "0.25rem 0.5rem",
          borderRadius: "6px"
        }}>
          {short(pubkey.toBase58())}
        </code>
      </div>
      
      <div style={{ 
        display: "flex", 
        gap: "1rem", 
        marginBottom: "1.5rem",
        fontSize: "0.875rem",
        color: "var(--text-secondary)",
        flexWrap: "wrap"
      }}>
        <span>👤 {short(account.creator.toBase58())}</span>
        <span>•</span>
        <span>
          {account.isActive ? "🟢 Active" : "⚫ Closed"}
        </span>
        <span>•</span>
        <span>⏰ {new Date(end * 1000).toLocaleString()}</span>
        <span>•</span>
        <span>🗳️ {totalVotes} votes</span>
      </div>
      
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ 
          fontSize: "0.875rem", 
          fontWeight: 600,
          color: "var(--text-secondary)",
          marginBottom: "0.75rem",
          textTransform: "uppercase",
          letterSpacing: "0.05em"
        }}>
          Results
        </div>
        {account.options.map((option, idx) => {
          const votes = account.voteCounts[idx]?.toNumber() || 0;
          const percentage = totalVotes > 0 ? ((votes / totalVotes) * 100).toFixed(1) : "0";
          const isWinning = totalVotes > 0 && idx === winningIndex;
          
          return (
            <div key={idx} style={{ marginBottom: "0.75rem" }}>
              <div style={{ 
                display: "flex", 
                justifyContent: "space-between",
                marginBottom: "0.5rem",
                alignItems: "center"
              }}>
                <span style={{ 
                  fontWeight: isWinning ? 600 : 400,
                  color: isWinning ? "var(--accent-primary)" : "var(--text-primary)"
                }}>
                  {isWinning && "🏆 "}{option}
                </span>
                <span style={{ 
                  fontSize: "0.875rem",
                  color: "var(--text-secondary)",
                  fontWeight: 500
                }}>
                  {votes} votes ({percentage}%)
                </span>
              </div>
              <div style={{ 
                height: 8, 
                background: "var(--bg-tertiary)", 
                borderRadius: 8, 
                overflow: "hidden",
                border: "1px solid var(--border-color)"
              }}>
                <div style={{ 
                  height: "100%", 
                  width: `${percentage}%`, 
                  background: isWinning 
                    ? "linear-gradient(90deg, var(--accent-primary), var(--accent-hover))"
                    : "linear-gradient(90deg, #4ade80, #22c55e)",
                  transition: "width 0.5s ease",
                  boxShadow: isWinning ? "0 0 12px var(--accent-glow)" : "none"
                }} />
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ 
        display: "flex", 
        gap: "0.75rem", 
        flexWrap: "wrap",
        paddingTop: "1rem",
        borderTop: "1px solid var(--border-color)"
      }}>
        {account.options.map((option, idx) => (
          <button 
            key={idx}
            onClick={() => vote(idx)} 
            disabled={!canVote}
            style={{ 
              flex: "1 1 auto",
              minWidth: "120px",
              padding: "0.75rem 1.25rem",
              fontSize: "0.9rem",
              fontWeight: 500
            }}
          >
            Vote: {option}
          </button>
        ))}
        {canClose && (
          <button 
            onClick={close}
            style={{
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              color: "var(--danger)"
            }}
          >
            🔒 Close Proposal
          </button>
        )}
      </div>
    </div>
  );
}

function parseAnchorError(e: any): string {
  const msg = e?.error?.errorMessage || e?.message || "Transaction failed";
  if (/ProposalClosed/i.test(msg)) return "Propunerea este închisă.";
  if (/Unauthorized/i.test(msg)) return "Doar creatorul poate închide.";
  if (/DeadlinePassed|VotingClosed/i.test(msg))
    return "A trecut deadline-ul de vot.";
  if (/TooEarlyToClose/i.test(msg)) return "Prea devreme pentru închidere.";
  if (/already in use|already initialized|account .* exists/i.test(msg))
    return "Ai votat deja pentru această propunere (1 vot per wallet).";
  if (/does not exist|program .* not exist/i.test(msg))
    return "Programul nu există pe cluster. Verifică VITE_PROGRAM_ID și Devnet.";
  if (/insufficient funds|lamports/i.test(msg))
    return "Fonduri insuficiente pentru fee. Fă un airdrop în wallet (Devnet).";
  if (/recentBlockhash|Blockhash not found/i.test(msg))
    return "Blockhash expirat. Reîncearcă sau reîncarcă pagina.";
  return msg;
}

function short(x: string, n: number = 4) {
  return `${x.slice(0, n)}...${x.slice(-n)}`;
}
