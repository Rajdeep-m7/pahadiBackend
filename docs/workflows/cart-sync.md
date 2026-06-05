# Cart Sync Workflow (Hybrid Strategy)

To provide a "lightning-fast" UI without risking data loss, we implement a Hybrid Sync Strategy across the frontend and backend.

## 1. The Three Layers of Defense

### Layer 1: LocalStorage (Instant Persistence)
The frontend must sync its internal state (Zustand/Redux) to `localStorage` on every change. 
- **Benefit:** If the user closes the tab or loses internet, the cart is never lost. On next load, the app hydrates the state from `localStorage`.

### Layer 2: Debounced Syncing (Background Recovery)
We do not call the backend on every single "+" or "-" click. Instead, we use a **3-second debounce**.
- **Logic:** Wait for the user to stop interacting for 3 seconds, then send the entire items array to `PUT /api/v1/cart/sync`.
- **Benefit:** Reduces server load (1 write instead of 10) while ensuring the backend has a fresh copy for cross-device syncing.

### Layer 3: Visibility Change (The Last Gasp)
To catch users who close the tab *before* the debounce timer finishes, use the `visibilitychange` API.
- **Implementation:** When `document.visibilityState === 'hidden'`, trigger an immediate sync using `navigator.sendBeacon()`.
- **Benefit:** Guarantees that the final state reaches the server even if the tab is being destroyed.

## 2. Cross-Device Hydration
When a user logs in:
1. The frontend checks if there's an existing cart in `localStorage`.
2. It fetches the backend cart via `GET /api/v1/cart`.
3. **Merge Logic:** If both exist, the frontend should merge them (or prioritize the backend) and then call `PUT /api/v1/cart/sync` to unify the state.
