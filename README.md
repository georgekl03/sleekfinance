# SleekFinance

SleekFinance is a dark-themed personal finance and budgeting workspace. Stage 1 provides an interactive shell with navigation, placeholder content for each upcoming module, and a simple sign-in experience.

## Quickstart

The app ships with a one-command launcher that installs dependencies (if needed) and boots the Vite dev server.

```bash
./start.sh
```

Once the server is running, open the provided URL in your browser (defaults to `http://localhost:5173`). Use any email and password to sign in and explore the application shell.

## Available Scripts

| Command | Description |
| --- | --- |
| `./start.sh` | Installs dependencies on first run and starts the Vite development server. |
| `npm run dev` | Starts the Vite development server without installing dependencies. |
| `npm run build` | Type-checks and bundles the production build. |
| `npm run preview` | Serves the production build locally after running `npm run build`. |

## Project Structure

```
├── index.html              # Vite entry point
├── src
│   ├── App.tsx             # App routing and authentication gate
│   ├── main.tsx            # React bootstrap
│   ├── auth/               # Simple auth context
│   ├── components/         # Reusable UI elements (layout, tooltips, headers)
│   ├── pages/              # Placeholder content for each navigation section
│   └── styles/             # Global and component-scoped styles
├── start.sh                # One-command launcher
└── README.md
```

## Accessibility & Theming

The shell uses a high-contrast dark palette with orange/yellow accents. Tooltips are placed throughout the experience as placeholders for future contextual help. Layouts are responsive down to tablet sizes, and core navigation is keyboard accessible via focus styles supplied by the browser.

## Next Steps

Future stages will wire up data models, rule engines, import pipelines, analytics dashboards, and investment tracking based on the placeholders introduced here.
