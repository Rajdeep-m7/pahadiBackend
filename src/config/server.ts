import type { Server } from 'http';
import type { Mongoose } from 'mongoose';
import type Agenda from 'agenda';

export const gracefullyShutdown = async (server: Server | null, db: Mongoose | null, agenda?: Agenda) => {
  console.log('\n[•] Gracefully shutting down server...');

  try {
    if (agenda) {
      await agenda.stop();
      console.log('[✔] Agenda job processor stopped');
    }

    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) return reject(err);
          console.log('[✔] HTTP server closed');
          resolve();
        });
      });
    }

    if (db) {
      await db.connection.close();
      console.log('[✔] Database connection closed');
    }

    console.log('[✔] Server gracefully shutdown.');
    process.exit(0);
  } catch (error) {
    console.error('[✖] Error during shutdown:', error);
    process.exit(1);
  }
};
