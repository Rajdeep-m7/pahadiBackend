# Pahadi Backend

The core backend service for the Pahadi e-commerce platform, built with Node.js, Express, and TypeScript. 

## Available Scripts

In the project directory, you can run the following commands:

* **`npm run dev`**: Starts the development server using `tsx` with live-reloading. Uses the `.env` file for environment variables.
* **`npm run type-check`**: Runs the TypeScript compiler to catch type errors without emitting the compiled JavaScript files.
* **`npm run build`**: Compiles the TypeScript source code into the `dist/` directory for production.
* **`npm run start`**: Starts the production server using the compiled JavaScript in the `dist/` folder.
* **`npm run format`**: Formats all your code instantly using Prettier to maintain a consistent style.
* **`npm run lint`**: Scans your TypeScript files for errors, bugs, or bad practices using ESLint.
* **`npm run lint:fix`**: Automatically fixes any ESLint errors that can be auto-resolved.

---

## Documentation

Our documentation is strictly divided into **What** (API References), **How** (Workflows), and **Why** (Architecture) to keep things scalable and easy to read.

### API References (The "What")
Detailed endpoint descriptions, payloads, and parameters.
* [Auth API](./docs/api/auth.md) - Endpoints for OTP generation, login, and session management.
* [User Management API](./docs/api/user.md) - Endpoints for profile updates, staff creation, and admin user controls.

### Frontend Workflows (The "How")
Guides for front-end integration and system behavior.
* [Authentication Architecture](./docs/workflows/authentication.md) - Details the hybrid web/mobile token storage and rotation interceptor flow.
* [Progressive Auth Flow](./docs/workflows/progressive-auth.md) - Explains the step-by-step logic for onboarding customers via WhatsApp OTP without forcing immediate profile completion.

### System Architecture (The "Why")
Core backend concepts and database rules.
* [Roles & Permissions](./docs/architecture/roles-permissions.md) - The strict RBAC (Role-Based Access Control) matrix dictating what Customers, Staff, and Admins can do.
* [Database Schema Concepts](./docs/architecture/database-schema.md) - Explanations of Mongoose schema decisions, indexing strategies, and hooks.

### Testing
* [Postman Collection](./docs/postman/MSCliq_Collection.json) - Import this file directly into Postman to instantly test all available routes in your local environment.
