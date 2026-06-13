import Agenda from 'agenda';
import mongoose from 'mongoose';
import env from '@/config/env';
import { processNotificationJob } from '@/api/v1/controllers/notification.controller';

const agenda = new Agenda({
  processEvery: '3 minute',
  maxConcurrency: 10,
  defaultConcurrency: 5,
});

/**
 * Initializes agenda
 */
export const initAgenda = async () => {
  console.log('[•] Entering initAgenda...');
  try {
    console.log('[•] Connecting Agenda to MongoDB...');
    
    if (mongoose.connection.readyState === 1) {
      // Use existing mongoose connection to save resources
      agenda.mongo(mongoose.connection.getClient().db() as any, 'agendaJobs');
    } else {
      // Fallback if mongoose isn't ready yet
      agenda.database(env.MONGODB_URI!, 'agendaJobs');
    }
    
    console.log('[•] Calling agenda.start()...');
    await agenda.start();
    console.log('[✔] Agenda job processor started successfully');
  } catch (error) {
    console.error('[✖] Failed to initialize Agenda:', error);
    // We don't throw here to allow the rest of the server to potentially start
  }
};

agenda.define('process-notification', async (job) => {
  const { notificationId } = job.attrs.data as { notificationId: string };
  console.log(`[Agenda] Job triggered for notificationId: ${notificationId}`);
  await processNotificationJob(notificationId);
});

export default agenda;
