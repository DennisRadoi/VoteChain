import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { VotingDapp } from "../target/types/voting_dapp";
import { assert } from "chai";

describe("voting_dapp with deadline", () => {
  const provider = anchor.AnchorProvider.local();
  anchor.setProvider(provider);
  const program = anchor.workspace.VotingDapp as Program<VotingDapp>;

  function deriveVotePda(
    proposal: anchor.web3.PublicKey,
    voter: anchor.web3.PublicKey
  ) {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vote"), proposal.toBuffer(), voter.toBuffer()],
      program.programId
    )[0];
  }

  async function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  it("Creates proposal with deadline", async () => {
    const proposal = anchor.web3.Keypair.generate();
    const duration = 10;

    await program.methods
      .createProposal("Deadline test base", new anchor.BN(duration))
      .accounts({
        proposal: proposal.publicKey,
        creator: provider.wallet.publicKey,
      })
      .signers([proposal])
      .rpc();

    const acc: any = await program.account.proposal.fetch(proposal.publicKey);
    assert.equal(acc.description, "Deadline test base");
    assert.isTrue(acc.isActive);
    assert.isAbove(acc.endTs.toNumber(), acc.startTs.toNumber());
  });

  it("Allows voting before deadline", async () => {
    const proposal = anchor.web3.Keypair.generate();
    const duration = 5;

    await program.methods
      .createProposal("Vote before deadline", new anchor.BN(duration))
      .accounts({
        proposal: proposal.publicKey,
        creator: provider.wallet.publicKey,
      })
      .signers([proposal])
      .rpc();

    const votePda = deriveVotePda(
      proposal.publicKey,
      provider.wallet.publicKey
    );

    await program.methods
      .vote(true)
      .accountsStrict({
        proposal: proposal.publicKey,
        vote: votePda,
        voter: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const acc: any = await program.account.proposal.fetch(proposal.publicKey);
    assert.equal(acc.votesYes.toNumber(), 1);
    assert.equal(acc.votesNo.toNumber(), 0);
  });

  it("Prevents vote after deadline", async () => {
    const proposal = anchor.web3.Keypair.generate();
    const duration = 1;

    await program.methods
      .createProposal("Expire fast", new anchor.BN(duration))
      .accounts({
        proposal: proposal.publicKey,
        creator: provider.wallet.publicKey,
      })
      .signers([proposal])
      .rpc();

    await sleep(1500);

    const votePda = deriveVotePda(
      proposal.publicKey,
      provider.wallet.publicKey
    );
    let failed = false;
    try {
      await program.methods
        .vote(true)
        .accountsStrict({
          proposal: proposal.publicKey,
          vote: votePda,
          voter: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    } catch {
      failed = true;
    }
    assert.isTrue(failed, "Vote should fail after deadline");
  });

  it("Cannot close before deadline", async () => {
    const proposal = anchor.web3.Keypair.generate();
    const duration = 3;

    await program.methods
      .createProposal("Early close attempt", new anchor.BN(duration))
      .accounts({
        proposal: proposal.publicKey,
        creator: provider.wallet.publicKey,
      })
      .signers([proposal])
      .rpc();

    let failed = false;
    try {
      await program.methods
        .closeProposal()
        .accounts({
          proposal: proposal.publicKey,
          creator: provider.wallet.publicKey,
        })
        .rpc();
    } catch {
      failed = true;
    }
    assert.isTrue(failed, "Should not close before deadline");
  });

  it("Can close after deadline passes", async () => {
    const proposal = anchor.web3.Keypair.generate();
    const duration = 1;

    await program.methods
      .createProposal("Close after expiry", new anchor.BN(duration))
      .accounts({
        proposal: proposal.publicKey,
        creator: provider.wallet.publicKey,
      })
      .signers([proposal])
      .rpc();

    await sleep(1500);

    await program.methods
      .closeProposal()
      .accounts({
        proposal: proposal.publicKey,
        creator: provider.wallet.publicKey,
      })
      .rpc();

    const acc: any = await program.account.proposal.fetch(proposal.publicKey);
    assert.isFalse(acc.isActive);
  });

  it("Rejects invalid duration", async () => {
    const proposal = anchor.web3.Keypair.generate();
    let failed = false;
    try {
      await program.methods
        .createProposal("Invalid duration", new anchor.BN(0))
        .accounts({
          proposal: proposal.publicKey,
          creator: provider.wallet.publicKey,
        })
        .signers([proposal])
        .rpc();
    } catch {
      failed = true;
    }
    assert.isTrue(failed, "Should fail on duration 0");
  });
});
