use anchor_lang::prelude::*;


#[event]
pub struct ProposalCreated {
    pub proposal: Pubkey,
    pub creator: Pubkey,
    pub start_ts: i64,
    pub end_ts: i64,
    pub num_options: u8,
}

#[event]
pub struct VoteCast {
    pub proposal: Pubkey,
    pub voter: Pubkey,
    pub option_index: u8,
}

#[event]
pub struct ProposalClosed {
    pub proposal: Pubkey,
    pub vote_counts: Vec<u64>,
    pub end_ts: i64,
}

const MAX_DESCRIPTION_LEN: usize = 200;
const MAX_OPTION_LEN: usize = 50;
const MAX_OPTIONS: usize = 10;

declare_id!("YzJtguRigAkcpxN5rRpWWiJiQkBXKXNZEu5zWQVJqK4");
#[program]
pub mod voting_dapp {
    use super::*;
    pub fn create_proposal(
        ctx: Context<CreateProposal>, 
        description: String, 
        options: Vec<String>,
        duration_sec: i64,
    ) -> Result<()> {
        require!(description.len() <= MAX_DESCRIPTION_LEN, VotingError::DescriptionTooLong);
        require!(duration_sec > 0, VotingError::InvalidDuration);
        require!(options.len() >= 2, VotingError::NotEnoughOptions);
        require!(options.len() <= MAX_OPTIONS, VotingError::TooManyOptions);
        
        for opt in &options {
            require!(opt.len() <= MAX_OPTION_LEN, VotingError::OptionTooLong);
        }

        let now = Clock::get()?.unix_timestamp;

        let proposal = &mut ctx.accounts.proposal;
        proposal.creator = *ctx.accounts.creator.key;
        proposal.description = description;
        proposal.options = options.clone();
        proposal.vote_counts = vec![0; options.len()];
        proposal.is_active = true;
        proposal.start_ts = now;
        proposal.end_ts = now + duration_sec;

        emit!(ProposalCreated {
            proposal: proposal.key(),
            creator: ctx.accounts.creator.key(),
            start_ts: proposal.start_ts,
            end_ts: proposal.end_ts,
            num_options: options.len() as u8,
        });
        
        Ok(())
    }


    pub fn vote(ctx: Context<VoteProposal>, option_index: u8) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        require!(proposal.is_active, VotingError::ProposalClosed);

        let now = Clock::get()?.unix_timestamp;
        require!(now < proposal.end_ts, VotingError::DeadlinePassed);
        require!((option_index as usize) < proposal.options.len(), VotingError::InvalidOption);
        
       
        let vote = &mut ctx.accounts.vote;
        vote.proposal = proposal.key();
        vote.voter = *ctx.accounts.voter.key;
        vote.option_index = option_index;
        vote.bump = ctx.bumps.vote;

        
        proposal.vote_counts[option_index as usize] += 1;
        
        emit!(VoteCast {
            proposal: proposal.key(),
            voter: ctx.accounts.voter.key(),
            option_index,
        });
        Ok(())
    }

    
    pub fn close_proposal(ctx: Context<CloseProposal>) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        require!(proposal.creator == *ctx.accounts.creator.key, VotingError::Unauthorized);

        let now = Clock::get()?.unix_timestamp;
        require!(now >= proposal.end_ts, VotingError::TooEarlyToClose);

        proposal.is_active = false;
        emit!(ProposalClosed {
            proposal: proposal.key(),
            vote_counts: proposal.vote_counts.clone(),
            end_ts: proposal.end_ts,
        });
        Ok(())
    }
    pub fn delete_proposal(ctx: Context<DeleteProposal>) -> Result<()> {
        let proposal = &ctx.accounts.proposal;
        require!(proposal.creator == *ctx.accounts.creator.key, VotingError::Unauthorized);
        require!(!proposal.is_active, VotingError::ProposalStillActive);
        
        Ok(())
    }
}

#[account]
pub struct  Proposal {
    pub creator: Pubkey,
    pub description: String,
    pub options: Vec<String>,
    pub vote_counts: Vec<u64>,
    pub is_active: bool,
    pub start_ts: i64,
    pub end_ts: i64,
}

#[account]
pub struct Vote {
    pub proposal: Pubkey,
    pub voter: Pubkey,
    pub option_index: u8,
    pub bump: u8,
}



#[derive(Accounts)]
pub struct CreateProposal<'info> {
    #[account(init, payer = creator, space = 900)]
    pub proposal: Account<'info, Proposal>,
    #[account(mut)]
    pub creator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct VoteProposal<'info> {
    #[account(mut)]
    pub proposal: Account<'info, Proposal>,
    #[account(
        init, 
        payer = voter, 
        space = 8 + 32 + 32 + 1 + 1, 
        seeds = [b"vote", proposal.key().as_ref(), voter.key().as_ref()],
        bump
    )]
    pub vote: Account<'info, Vote>,
    #[account(mut)]
    pub voter: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseProposal<'info> {
    #[account(mut)]
    pub proposal: Account<'info, Proposal>,
    pub creator: Signer<'info>,
}

#[derive(Accounts)]
pub struct DeleteProposal<'info> {
    #[account(mut, close = creator)]
    pub proposal: Account<'info, Proposal>,
    #[account(mut)]
    pub creator: Signer<'info>,
}


#[error_code]
pub enum VotingError {
    #[msg("Proposal is closed.")]
    ProposalClosed,
    #[msg("You are not the creator.")]
    Unauthorized,
    #[msg("Description is too long")]
    DescriptionTooLong,
    #[msg("Invalid duration (must be > 0 ).")]
    InvalidDuration,    
    #[msg("Voting deadline is passed")]
    DeadlinePassed,
    #[msg("Too early to close.")]
    TooEarlyToClose,
    #[msg("Not enough options (must be >= 2).")]
    NotEnoughOptions,
    #[msg("Too many options (max 10).")]
    TooManyOptions,
    #[msg("Option text is too long (max 50 chars).")]
    OptionTooLong,
    #[msg("Invalid option index.")]
    InvalidOption,
    #[msg("Proposal must be closed before deletion.")]
    ProposalStillActive,
}
