import { useEffect, useMemo, useState } from "react";
import * as anchor from "@coral-xyz/anchor";
import idl from "./idl/voting_dapp.json";
import { getAnchorProgram, fetchAllAccounts } from "./anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import CreateProposalForm from "./CreateProposalForm";
import ProposalCard from "./ProposalCard";

// UI type (camelCase)
type ProposalAccount = {
  creator: PublicKey;
  description: string;
  options: string[];
  voteCounts: anchor.BN[];
  isActive: boolean;
  startTs: anchor.BN;
  endTs: anchor.BN;
};

// Raw account type as defined in IDL (snake_case)
type RawProposalAccount = {
  creator: PublicKey;
  description: string;
  options: string[];
  vote_counts: anchor.BN[];
  is_active: boolean;
  start_ts: anchor.BN;
  end_ts: anchor.BN;
};

type AnchorAccount<T> = { pubkey: PublicKey; account: T };

export default function App() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const PROGRAM_ID = import.meta.env.VITE_PROGRAM_ID as string;
  const programId = useMemo(() => new PublicKey(PROGRAM_ID), [PROGRAM_ID]);

  // Initialize Anchor Program
  const program = useMemo(() => {
    if (!wallet.publicKey) return undefined;
    return getAnchorProgram(idl as any, PROGRAM_ID, connection, wallet as any);
  }, [connection, wallet, PROGRAM_ID]);

  const [proposals, setProposals] = useState<AnchorAccount<ProposalAccount>[]>(
    []
  );
  const [error, setError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(false);

  // Load proposals without program.account.* (avoids the crash)
  async function load() {
    if (!program) return;
    setLoadingList(true);
    setError(null);
    try {
      const raw = await fetchAllAccounts<RawProposalAccount>(
        connection,
        programId,
        idl as any,
        "Proposal" // account name from IDL
      );

      const mapped: AnchorAccount<ProposalAccount>[] = raw
        .filter((r) => {
          // Filter out old proposals that don't have the new structure
          return r.account.options && r.account.vote_counts;
        })
        .map((r) => ({
          pubkey: r.pubkey,
          account: {
            creator: r.account.creator,
            description: r.account.description,
            options: r.account.options,
            voteCounts: r.account.vote_counts,
            isActive: r.account.is_active,
            startTs: r.account.start_ts,
            endTs: r.account.end_ts,
          },
        }));

      mapped.sort(
        (a, b) => b.account.endTs.toNumber() - a.account.endTs.toNumber()
      );
      setProposals(mapped);
    } catch (e: any) {
      console.error("Eroare la load():", e);
      setError(e?.message || "A apărut o eroare la încărcarea propunerilor.");
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program?.programId.toBase58()]);

  // Optional event listeners (keep as you had)
  useEffect(() => {
    if (!program) return;
    let subs: number[] = [];
    (async () => {
      try {
        const names = ["ProposalCreated", "VoteCast", "ProposalClosed"];
        for (const name of names) {
          const hasEvent =
            Array.isArray((program as any).idl?.events) &&
            (program as any).idl.events.some((e: any) => e?.name === name);
          if (hasEvent) {
            const id = await program.addEventListener(name, () => load());
            subs.push(id);
          }
        }
      } catch (e) {
        console.warn("Nu s-au putut atașa toți event listeners:", e);
      }
    })();
    return () => {
      subs.forEach((s) => {
        try {
          program.removeEventListener(s);
        } catch {}
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program?.programId.toBase58()]);

  return (
    <div style={{ 
      maxWidth: 900, 
      margin: "0 auto", 
      padding: "2rem 1.5rem",
      minHeight: "100vh"
    }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "3rem",
          padding: "1.5rem 0",
          borderBottom: "1px solid var(--border-color)"
        }}
      >
        <div>
          <h2 style={{ 
            background: "linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            fontSize: "2.5rem",
            margin: 0
          }}>
            ⚡ Voting dApp
          </h2>
          <p style={{ color: "var(--text-secondary)", margin: "0.5rem 0 0 0", fontSize: "0.95rem" }}>
            Decentralized voting on Solana
          </p>
        </div>
        <WalletMultiButton />
      </header>

      {!wallet.connected ? (
        <div style={{
          textAlign: "center",
          padding: "4rem 2rem",
          background: "var(--bg-secondary)",
          borderRadius: "20px",
          border: "1px solid var(--border-color)"
        }}>
          <h3 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>👋 Welcome!</h3>
          <p style={{ color: "var(--text-secondary)", marginBottom: "2rem" }}>
            Connect your wallet on Devnet to get started
          </p>
        </div>
      ) : !program ? (
        <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-secondary)" }}>
          <p>⏳ Initializing program...</p>
        </div>
      ) : (
        <>
          {error && (
            <div
              style={{
                marginBottom: "1.5rem",
                padding: "1rem 1.5rem",
                background: "rgba(239, 68, 68, 0.1)",
                color: "var(--danger)",
                borderRadius: "12px",
                border: "1px solid rgba(239, 68, 68, 0.3)"
              }}
            >
              <strong>⚠️ Error:</strong> {error}
            </div>
          )}

          <CreateProposalForm program={program} onCreated={() => load()} />

          <div style={{ marginTop: "3rem" }}>
            <h3 style={{ 
              fontSize: "1.75rem",
              marginBottom: "1.5rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem"
            }}>
              📊 Active Proposals
            </h3>
            {loadingList && (
              <p style={{ textAlign: "center", color: "var(--text-secondary)", padding: "2rem" }}>
                Loading proposals...
              </p>
            )}
            {!loadingList && proposals.length === 0 && (
              <div style={{
                textAlign: "center",
                padding: "3rem 2rem",
                background: "var(--bg-secondary)",
                borderRadius: "16px",
                border: "1px solid var(--border-color)"
              }}>
                <p style={{ color: "var(--text-secondary)", fontSize: "1.1rem" }}>
                  📭 No proposals yet. Create the first one!
                </p>
              </div>
            )}
            {!loadingList &&
              proposals.map((p) => (
                <ProposalCard
                  key={p.pubkey.toBase58()}
                  program={program}
                  programId={programId}
                  pubkey={p.pubkey}
                  account={p.account}
                  walletPubkey={wallet.publicKey!}
                  onChanged={() => load()}
                />
              ))}
          </div>
        </>
      )}
    </div>
  );
}
