# AI Template Parser - Commercial Web Application

A high-end, enterprise-grade web application for parsing Adobe Illustrator templates with SOTA variable detection and structure analysis.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **UI Components**: Shadcn/UI + Radix UI primitives
- **Styling**: Tailwind CSS + CSS Variables
- **Theme**: Dark Mode (default)
- **Backend**: Fastify + TypeScript
- **Icons**: Lucide React

## Features

- 🎨 **Premium Dark Theme** - Modern glassmorphism design with smooth animations
- 📤 **Drag & Drop Upload** - Interactive file upload with visual feedback
- 🔍 **SOTA Variable Detection** - Advanced AI-powered detection of 135+ variable types
- 📊 **Results Dashboard** - Comprehensive analytics and visualization
- ✅ **Integrity Validation** - ID uniqueness, hierarchy, and bounds checking
- 📱 **Fully Responsive** - Optimized for all screen sizes

## Project Structure

```
web/
├── server/                 # Fastify backend
│   ├── src/
│   │   ├── index.ts       # Main server entry
│   │   ├── config.ts      # Configuration
│   │   ├── routes/        # API routes
│   │   └── services/      # Business logic
│   └── package.json
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/    # React components
│   │   │   ├── ui/        # Shadcn-style components
│   │   │   ├── Header.tsx
│   │   │   ├── Dropzone.tsx
│   │   │   ├── ProcessingState.tsx
│   │   │   └── ResultsDashboard.tsx
│   │   ├── hooks/         # Custom React hooks
│   │   ├── types/         # TypeScript types
│   │   └── lib/           # Utilities
│   └── package.json
├── start.sh               # Startup script
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Adobe Illustrator (for parsing)

### Installation

```bash
# Navigate to web directory
cd web

# Install server dependencies
cd server && npm install && cd ..

# Install client dependencies
cd client && npm install && cd ..
```

### Running the Application

#### Development Mode (Recommended)

```bash
# Run using the startup script
./start.sh

# Or run separately:
# Terminal 1 - Server
cd server && npm run dev

# Terminal 2 - Client
cd client && npm run dev
```

#### Production Build

```bash
# Build client
cd client && npm run build

# Build server
cd ../server && npm run build

# Start production server
cd .. && node server/dist/index.js
```

### Access

- **Development**: http://localhost:3000 (client) → http://localhost:8080 (API)
- **Production**: http://localhost:8080 (serves static files)

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/upload` | Upload AI file |
| POST | `/api/process/:taskId` | Start parsing |
| GET | `/api/result/:taskId` | Get parsing result |
| GET | `/api/status/:taskId` | Check processing status |
| GET | `/api/health` | Health check |

## UI Components

The application uses a custom Shadcn/UI-style component library with:

- **Button** - Multiple variants (default, glow, outline, ghost)
- **Card** - Glassmorphism effect with hover animations
- **Progress** - Animated gradient progress bar
- **Badge** - Color-coded variable types
- **Tabs** - Animated tab switching
- **Accordion** - Expandable sections

## Design System

### Colors (Dark Mode)

- **Background**: `hsl(222 47% 5%)`
- **Card**: `hsl(222 47% 8%)`
- **Primary**: `hsl(217 91% 60%)`
- **Accent**: `hsl(217 33% 17%)`

### Animations

- `fade-in` - Smooth opacity transition
- `slide-up` - Slide up with fade
- `shimmer` - Loading shimmer effect
- `pulse` - Gentle pulse for active states

## License

MIT
