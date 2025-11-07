# SleekFinance

Stage 1 delivers a runnable shell for the SleekFinance personal finance and budgeting application. The goal is to provide a dark, modern workspace that previews the final navigation, layouts, and guidance for later product milestones.

## Features

- 🔐 Demo sign-in gate to reveal the finance workspace (`demo@finance.app` / `demo123`)
- 🧭 Left-hand navigation with routed placeholder pages for every planned section
- 💡 Tooltip placeholders on each page outlining planned functionality
- 🆘 Help landing page that explains the purpose of every navigation area
- 🎨 Dark UI with orange/yellow accent styling
- 🚀 Zero-dependency setup served with a lightweight local web server

## Quickstart

The project ships with a single command that installs prerequisites (none required) and boots the local development server.

```bash
npm start
```

The command starts a static server at [http://localhost:5173](http://localhost:5173). Use the demo credentials to sign in and explore each section.

## Project Structure

```
├── index.html          # Application entry point and layout markup
├── scripts/app.js      # Navigation, routing, and authentication logic
├── styles/main.css     # Dark theme with orange/yellow accents
├── start.sh            # Launcher script invoked by npm start
└── README.md           # Project documentation
```

## Next Steps

Stage 2 will flesh out persistent data handling, rich filtering, and the import/rules engines. This shell intentionally focuses on fast navigation and UX previews to guide the upcoming implementation phases.
