# 🗳️ VoteChain - Vanilla JavaScript Version

A simplified version of the voting dApp using only **HTML, CSS, and vanilla JavaScript** with Vite for development.

## ✨ Features

- ⚡ **Pure JavaScript** - No React, no frameworks
- 🎨 **Modern UI** - Dark theme with Space Grotesk font
- 🔒 **Time-Locked Results** - Results hidden until voting ends
- 🏆 **Winner Highlighting** - Winning option gets special styling
- 📊 **Real-time Updates** - Live vote counts and percentages
- 🌐 **Solana Integration** - Connect with Phantom wallet

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd frontend-simple
npm install
```

### 2. Run Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### 3. Connect Wallet

- Make sure you have Phantom wallet installed
- Switch to Devnet in Phantom settings
- Click "Connect Wallet"

### 4. Create a Proposal

- Enter a description
- Add 2-10 options
- Set duration in seconds
- Click "Create Proposal"

### 5. Vote

- Click on any option button to vote
- Each wallet can vote once per proposal
- Results are hidden until voting ends

## 📁 File Structure

```
frontend-simple/
├── index.html          # Main HTML file
├── style.css           # All styles
├── app.js              # All JavaScript logic
├── package.json        # Dependencies
├── vite.config.js      # Vite configuration
└── README.md           # This file
```

## 🎨 Customization

### Change Colors

Edit the CSS variables in `style.css`:

```css
:root {
  --accent-primary: #8b5cf6;  /* Purple */
  --accent-hover: #a78bfa;
  --success: #10b981;          /* Green */
  --danger: #ef4444;           /* Red */
}
```

### Change Program ID

Edit the `PROGRAM_ID` in `app.js`:

```javascript
const PROGRAM_ID = 'YOUR_PROGRAM_ID_HERE';
```

### Change RPC Endpoint

Edit the `RPC_URL` in `app.js`:

```javascript
const RPC_URL = 'https://api.devnet.solana.com';
```

## 🔧 Build for Production

```bash
npm run build
```

The built files will be in the `dist/` folder.

## 📝 Notes

- **No TypeScript** - Pure JavaScript for simplicity
- **No Build Step Required** - Just HTML, CSS, JS
- **Vite for Dev Server** - Fast hot reload during development
- **Minimal Dependencies** - Only Solana Web3.js and Anchor

## 🐛 Troubleshooting

### Wallet Not Connecting

- Make sure Phantom is installed
- Check you're on Devnet
- Refresh the page

### Proposals Not Loading

- Check the program ID is correct
- Verify you're connected to Devnet
- Check browser console for errors

### Transaction Failing

- Make sure you have SOL on Devnet
- Request airdrop from https://faucet.solana.com/
- Check the program is deployed

## 📚 Learn More

- [Solana Documentation](https://docs.solana.com/)
- [Anchor Framework](https://www.anchor-lang.com/)
- [Phantom Wallet](https://phantom.app/)

## 🎉 Enjoy!

Your simplified voting dApp is ready to use!
