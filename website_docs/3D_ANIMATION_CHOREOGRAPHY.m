# 3D Animation & WebGL Choreography Specification

## 1. Global Canvas Architecture
The application uses a **Single Persistent Canvas** pattern (`position: fixed; inset: 0; z-index: 0`). DOM content sits inside a scroll container (`z-index: 10; pointer-events: none` on wrappers, `pointer-events: auto` on interactive cards).

## 2. Scroll-Driven Camera Timeline (GSAP ScrollTrigger)
The camera is attached to a `CatmullRomCurve3` spline through a 3D city block. As the user scrolls from `0%` to `100%` of the landing page, `scroll.offset` scrubs the camera and the hero 3D Electric Vehicle (EV) along the path.

### Scene 1: "The Urban Grid" (0% – 20% Scroll)
* **Camera Position:** High-angle isometric drone shot (`[45, 60, 45]`), looking down at a stylized dark-mode city block with glowing traffic spline lines.
* **Animation:** A sleek low-poly/PBR 3D car enters the main avenue. Streetlights dynamically illuminate as the car passes beneath them.
* **Mouse Interaction:** Subtle parallax tilt (`lerp` camera rotation based on normalized mouse coordinates `[-1, 1]`).
* **UI Overlay:** Hero title *"Park Anywhere. Own the Curb."* with an interactive "Quick Search" glassmorphic command bar.

### Scene 2: "The Search & Sonar Scan" (20% – 45% Scroll)
* **Camera Position:** Swoops down behind the car (3rd-person chase cam `[0, 4, -10]` relative to vehicle).
* **Animation:** The car triggers a **3D Sonar Pulse** (custom GLSL fragment shader expanding outward as a cyan ring across the city geometry). As the wave hits private driveways and garages, 3D holographic price pins (`₹40/hr`, `$4/hr`) pop up using spring physics and hover above the spots.
* **UI Overlay:** Feature breakdown cards explaining Real-Time Availability, Verified Hosts, and Instant Access.

### Scene 3: "The Precision Park" (45% – 70% Scroll)
* **Camera Position:** Orbits `180°` to a cinematic low-angle wheel-level shot, then pulls up to a top-down bird's-eye view of a luxury residential driveway.
* **Animation:** A glowing emeraldbezier trajectory curve draws itself on the asphalt from the car into the selected driveway. The car autonomously reverses into the spot. Once parked, a translucent green holographic shield domes over the vehicle, symbolizing security and confirmed reservation.
* **UI Overlay:** Interactive "Tap to Book" simulation widget showing license plate recognition, smart-gate unlock animation, and digital receipt.

### Scene 4: "Host Monetization — Turn Concrete into Cash" (70% – 90% Scroll)
* **Camera Position:** Pivots to an isometric cutaway view of a residential house and empty garage.
* **Animation:** The empty driveway tiles flip over like mechanical split-flap displays, glowing gold, while 3D floating coin/yield metrics (`+₹18,500/mo`) animate upward. A slider in the UI lets the user scrub hours/days, dynamically changing the height of a 3D bar chart right next to the house.

### Scene 5: "Dive Into Live Map" (90% – 100% Scroll)
* **Camera Position:** Zooms straight up into the clouds (`Y: +300`), seamlessly cross-fading the custom Three.js city mesh into the **Live Interactive 3D Mapbox Explorer** at the exact same camera pitch (`60°`) and bearing.

## 3. Custom Shaders & Visual Effects
* **Asphalt Wetness & Reflections:** Use `<MeshReflectorMaterial>` from `@react-three/drei` on road surfaces for cyberpunk-style neon reflections of the availability pins.
* **Spot Availability Beacon:** Custom vertex/fragment shader creating a vertical fading laser cylinder (`additiveBlending`) on available parking spots so they are visible from high zoom levels.
* **Post-Processing Pipeline:**
  * `<Bloom luminanceThreshold={1.1} mipmapBlur intensity={0.85} />` (Make only materials with `toneMapped={false}` and RGB values > 1 glow).
  * `<Vignette eskil={false} offset={0.1} darkness={0.8} />`