import { useState } from "react";
import * as anchor from "@coral-xyz/anchor";
import {
  Keypair,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  PublicKey,
} from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { Buffer } from "buffer";

// Discriminator din IDL pentru create_proposal
// "discriminator": [132,116,68,174,216,160,198,22]
const CREATE_PROPOSAL_DISC = Buffer.from([
  132, 116, 68, 174, 216, 160, 198, 22,
]);

function encodeStringBorsh(s: string): Buffer {
  const bytes = new TextEncoder().encode(s);
  const len = Buffer.alloc(4);
  len.writeUInt32LE(bytes.length, 0); // little-endian
  return Buffer.concat([len, Buffer.from(bytes)]);
}

function encodeI64LE(n: anchor.BN | number | string): Buffer {
  const bn = anchor.BN.isBN(n as any)
    ? (n as anchor.BN)
    : new anchor.BN(n as any);
  const big = BigInt(bn.toString());
  const buf = Buffer.alloc(8);
  buf.writeBigInt64LE(big);
  return buf;
}

function encodeVecString(arr: string[]): Buffer {
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32LE(arr.length, 0);
  const encoded = arr.map(s => encodeStringBorsh(s));
  return Buffer.concat([lenBuf, ...encoded]);
}

type Props = {
  program: Program<any>;
  onCreated?: (proposalPubkey: string) => void;
};

export default function CreateProposalForm({ program, onCreated }: Props) {
  const [description, setDescription] = useState("");
  const [options, setOptions] = useState<string[]>(["Option 1", "Option 2"]);
  const [durationSec, setDurationSec] = useState<number>(60);
  const [loading, setLoading] = useState(false);

  const { publicKey, signTransaction, connected } = useWallet();
  const { connection } = useConnection();

  async function sendTxManually(tx: Transaction, extraSigners: Keypair[] = []) {
    if (!connected || !publicKey) throw new Error("Wallet not connected");

    // Setează fee payer + recentBlockhash ÎNAINTE de orice semnătură
    tx.feePayer = publicKey;
    const latest = await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = latest.blockhash;

    // Semnează cu keypair-urile extra (ex: contul nou de proposal)
    extraSigners.forEach((kp) => tx.sign(kp));

    if (!signTransaction) throw new Error("Wallet cannot sign transactions");
    const signed = await signTransaction(tx);

    // Trimite + confirmă
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

  async function submit() {
    if (!connected || !publicKey) {
      alert("Conectează wallet-ul înainte de a crea o propunere.");
      return;
    }
    if (!description.trim()) return alert("Descrierea este goală");
    if (options.length < 2) return alert("Trebuie cel puțin 2 opțiuni");
    if (options.some(opt => !opt.trim())) return alert("Toate opțiunile trebuie completate");
    if (durationSec <= 0) return alert("Durata trebuie > 0");

    setLoading(true);
    try {
      const proposalKp = Keypair.generate();

      // Data: discriminator + (description: string) + (options: Vec<String>) + (duration_sec: i64)
      const descB = encodeStringBorsh(description);
      const optsB = encodeVecString(options);
      const durB = encodeI64LE(durationSec);
      const data = Buffer.concat([CREATE_PROPOSAL_DISC, descB, optsB, durB]);

      // Cheile în ordinea din IDL pentru create_proposal
      const keys = [
        { pubkey: proposalKp.publicKey, isWritable: true, isSigner: true },
        { pubkey: publicKey, isWritable: true, isSigner: true },
        { pubkey: SystemProgram.programId, isWritable: false, isSigner: false },
      ];

      const programId = (program as any).programId as PublicKey;
      const ix = new TransactionInstruction({ programId, keys, data });

      const tx = new Transaction().add(ix);

      // Semnăm manual (setăm blockhash + feePayer, apoi semnăm cu proposalKp și wallet)
      const sig = await sendTxManually(tx, [proposalKp]);

      onCreated?.(proposalKp.publicKey.toBase58());
      setDescription("");
      setOptions(["Option 1", "Option 2"]);
      setDurationSec(60);
      console.log("create_proposal tx:", sig);
    } catch (e: any) {
      console.error(e);
      alert(parseAnchorError(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ 
      background: "var(--bg-secondary)", 
      padding: "2rem", 
      borderRadius: "20px",
      border: "1px solid var(--border-color)",
      boxShadow: "0 4px 24px rgba(0, 0, 0, 0.4)"
    }}>
      <h3 style={{ marginBottom: "1.5rem", fontSize: "1.5rem" }}>✨ Create New Proposal</h3>
      
      <div style={{ marginBottom: "1.5rem" }}>
        <label style={{ 
          display: "block", 
          marginBottom: "0.5rem", 
          color: "var(--text-secondary)",
          fontSize: "0.9rem",
          fontWeight: 500
        }}>
          Description
        </label>
        <input
          placeholder="What are you voting on? (max 200 chars)"
          maxLength={200}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={{ width: "100%" }}
        />
      </div>
      
      <div style={{ marginBottom: "1.5rem" }}>
        <label style={{ 
          display: "block", 
          marginBottom: "0.75rem", 
          color: "var(--text-secondary)",
          fontSize: "0.9rem",
          fontWeight: 500
        }}>
          Options (2-10)
        </label>
        {options.map((opt, idx) => (
          <div key={idx} style={{ display: "flex", gap: "0.75rem", marginBottom: "0.75rem" }}>
            <input
              placeholder={`Option ${idx + 1} (max 50 chars)`}
              maxLength={50}
              value={opt}
              onChange={(e) => {
                const newOpts = [...options];
                newOpts[idx] = e.target.value;
                setOptions(newOpts);
              }}
              style={{ flex: 1 }}
            />
            {options.length > 2 && (
              <button
                onClick={() => setOptions(options.filter((_, i) => i !== idx))}
                style={{ 
                  padding: "0.75rem 1rem",
                  background: "rgba(239, 68, 68, 0.1)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  color: "var(--danger)"
                }}
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {options.length < 10 && (
          <button
            onClick={() => setOptions([...options, `Option ${options.length + 1}`])}
            style={{ 
              marginTop: "0.5rem",
              background: "rgba(139, 92, 246, 0.1)",
              border: "1px solid rgba(139, 92, 246, 0.3)",
              color: "var(--accent-primary)"
            }}
          >
            + Add Option
          </button>
        )}
      </div>

      <div style={{ 
        display: "flex", 
        gap: "1rem", 
        alignItems: "flex-end",
        flexWrap: "wrap"
      }}>
        <div style={{ flex: "1", minWidth: "200px" }}>
          <label style={{ 
            display: "block", 
            marginBottom: "0.5rem", 
            color: "var(--text-secondary)",
            fontSize: "0.9rem",
            fontWeight: 500
          }}>
            Duration (seconds)
          </label>
          <input
            type="number"
            min={1}
            value={durationSec}
            onChange={(e) => setDurationSec(Number(e.target.value))}
            style={{ width: "100%" }}
          />
        </div>
        <button 
          disabled={loading} 
          onClick={submit} 
          style={{ 
            padding: "0.875rem 2rem",
            fontSize: "1rem",
            fontWeight: 600,
            background: loading ? "var(--bg-tertiary)" : "var(--accent-primary)",
            border: loading ? "1px solid var(--border-color)" : "1px solid var(--accent-primary)"
          }}
        >
          {loading ? "⏳ Creating..." : "🚀 Create Proposal"}
        </button>
      </div>
    </div>
  );
}

function parseAnchorError(e: any): string {
  const msg = e?.error?.errorMessage || e?.message || "Transaction failed";
  if (msg.includes("DescriptionTooLong"))
    return "Descriere prea lungă (<=200).";
  if (msg.includes("InvalidDuration")) return "Durata trebuie > 0.";
  if (msg.toLowerCase().includes("program that does not exist"))
    return "Programul nu există pe cluster. Verifică VITE_PROGRAM_ID / Devnet / deploy.";
  if (msg.toLowerCase().includes("insufficient funds"))
    return "Fonduri insuficiente pe Devnet. Cere un airdrop în Phantom.";
  if (msg.toLowerCase().includes("recentblockhash required"))
    return "A apărut o problemă de blockhash. Încearcă din nou sau reîncarcă pagina.";
  return msg;
}
