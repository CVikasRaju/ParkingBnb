# ParkPeer — 3D Interactive Web Platform ("Airbnb for Parking")

## 1. Vision & Core Concept
**ParkPeer** is a peer-to-peer parking marketplace that connects property owners with unused driveways, garages, and private lots ("Hosts") with drivers looking for guaranteed, affordable, and convenient parking ("Peers"). 

The web platform is not a standard static SaaS page; it is an **Awwwards-tier, spatial 3D web experience** where the user's scroll and cursor movements pilot a stylized 3D vehicle through a glowing, interactive smart city, seamlessly transitioning from the hero narrative into a live 3D spatial booking map.

## 2. Aesthetic & Design Language
* **Theme:** "Cyber-Urban Mobility" — Deep obsidian/slate dark mode (`#080B11`) contrasted with electric emerald (`#10B981` for available spots), amber (`#F59E0B` for reserved/busy), and neon cyan (`#06B6D4` for navigation paths).
* **UI Surface Style:** Spatial Glassmorphism (`backdrop-filter: blur(20px)`, `1px solid rgba(255, 255, 255, 0.08)` borders) floating over a full-viewport (`100vw x 100vh`) interactive WebGL canvas.
* **Typography:** 
  * Headings: *Space Grotesk* or *Syne* (Bold, geometric, automotive/tech feel).
  * Body & Data: *Plus Jakarta Sans* & *JetBrains Mono* (for coordinates, pricing, timers, and license plates).

## 3. Production Tech Stack
* **Framework:** Next.js 14+ (App Router, TypeScript, Server Actions).
* **3D Engine & WebGL:** 
  * Three.js (`three`)
  * React Three Fiber (`@react-three/fiber`)
  * React Three Drei (`@react-three/drei`)
  * Post-Processing (`@react-three/postprocessing` for selective bloom, depth of field, and ambient occlusion).
* **Animation & Physics:** 
  * GSAP (`gsap` + `ScrollTrigger`) for camera pathing and timeline scrubbing.
  * Lenis (`@studio-freight/lenis`) for butter-smooth inertial scrolling synced with the R3F render loop.
  * Framer Motion for 2D HUD/UI transitions and micro-interactions.
* **Maps & Geospatial:**
  * Mapbox GL JS / `react-map-gl` with custom 3D building extrusions and custom Three.js layer overlays.
  * PostGIS (via Supabase) for real-time radius and bounding-box spatial queries.
* **State Management:** Zustand (bridges the gap between DOM UI components and the React Three Fiber Canvas without triggering costly re-renders).
* **Backend, Auth & Database:** Supabase (PostgreSQL + PostGIS, Supabase Auth with OAuth/OTP, Supabase Realtime for live spot lockouts).
* **Payments:** Stripe Connect (Split payments between ParkPeer platform fee and Host payouts) / Razorpay Route.